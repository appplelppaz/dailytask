"""商品URLごとの分析の流れ。

データの取り方は、設定されているキーによって自動で選ばれる。

  1. CSV 取込(Ahrefs 等)がその URL を含む        → その値を使う(取込)
  2. DataForSEO のキーがある                      → DB から順位付きキーワード一覧(外部DB)
       └ DB にデータが無い商品は 3 に切り替え
  3. どちらも無い(無料モード)                    → ページ内容 + Google サジェストから候補を作り、
       Serper のキーがあれば実際の検索結果で順位を確認(実測)、無ければ候補のまま(未確認)

どの方法でも、行ごとに「データ種別」「信頼度」「根拠」を持たせる。
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Callable

import pandas as pd

from . import metrics as M
from .dataforseo import DataForSEO, DataForSEOError
from .page import PageInfo, canonical_url, fetch_page, page_relevance
from .serper import Serper, SerperError, find_rank
from .suggest import suggest
from .taxonomy import (CATEGORIES, INTENT_LABELS, classify, format_categories, normalize,
                       query_word, rule_intent)


@dataclass
class Options:
    dfs_limit: int = 300          # DataForSEO: 1商品あたり最大キーワード数
    max_rank: int = 50            # この順位までを対象にする
    verify_top: int = 0           # DataForSEO の上位 N 件を Serper で実測確認(0=しない)
    serp_depth: int = 20          # Serper で何位まで見るか(10件=1クレジット)
    max_candidates: int = 25      # 無料モード: 1商品あたりの候補キーワード数
    use_suggest: bool = True
    cache_days: float = 30
    fetch_pages: bool = True


@dataclass
class ProductResult:
    label: str
    url: str
    page: PageInfo | None = None
    method: str = ""
    notes: list[str] = field(default_factory=list)
    dfs_total: int | None = None
    dfs_etv: float | None = None
    rows: list[dict] = field(default_factory=list)


Progress = Callable[[str], None]


def _item_type(page: PageInfo) -> str:
    for text in (page.headline_text + " " + " ".join(page.breadcrumbs), page.description, page.body_text[:5000]):
        items = [t for t in classify(text).get("アイテム", []) if t != "靴(総称)"]
        if items:
            return query_word("アイテム", items[0])
    return "靴"


def generate_candidates(page: PageInfo, max_candidates: int, use_suggest: bool) -> list[tuple[str, bool]]:
    """ページに書かれている特徴語から、検索されていそうなキーワード候補を作る。

    返り値: [(キーワード, サジェストに存在したか)]
    """
    item = _item_type(page)
    score: Counter = Counter()
    for text, weight in ((page.headline_text, 5), (" ".join(page.breadcrumbs), 3), (page.description, 2),
                         (page.body_text[:15000], 1)):
        for cat, terms in classify(text).items():
            if cat == "アイテム":
                continue
            for t in terms:
                score[(cat, t)] += weight
    page_norm = normalize(page.all_text)

    def surface(cat: str, canon: str) -> str:
        # 辞書の代表語ではなく、ページに実際に書かれている表記を使う(「大人」と書かれていれば「大人」)
        for v in CATEGORIES.get(cat, {}).get(canon, []):
            if normalize(v) in page_norm:
                return v
        return query_word(cat, canon)

    attrs = [surface(c, t) for (c, t), _ in score.most_common(40)]
    attrs = list(dict.fromkeys(a for a in attrs if a and a != item))

    # 値: True=サジェストに存在 / False=存在せず / None=未確認
    cands: dict[str, bool | None] = {item: None}
    for a in attrs:
        cands.setdefault(f"{a} {item}", None)
    if use_suggest:
        page_text = page_norm
        for a in attrs[:8]:
            sug = suggest(f"{item} {a}")[:10]
            sug_norm = {normalize(x) for x in sug}
            # 生成した「属性 アイテム」がサジェストに出ているか(語順違いも同じとみなす)
            for key in (f"{a} {item}", f"{item} {a}"):
                if normalize(key) in sug_norm:
                    cands[f"{a} {item}"] = True
            if cands[f"{a} {item}"] is None:
                cands[f"{a} {item}"] = False
            for s in sug:
                # サジェストのうち、語がすべて商品ページに書かれているものだけ候補にする
                if all(w in page_text for w in normalize(s).split(" ")):
                    if not any(set(normalize(s).split(" ")) == set(normalize(k).split(" ")) for k in cands):
                        cands[s] = True
    ordered = sorted(cands.items(), key=lambda kv: (kv[1] is not True, kv[0] == item))
    return ordered[:max_candidates]


def _base_row(p: ProductResult, keyword: str) -> dict:
    return {"product": p.label, "product_url": p.url, "keyword": keyword, "rank": None,
            "rank_kind": M.KIND_CANDIDATE, "rank_date": None, "ranking_url": None, "found": False,
            "db_rank": None, "live_rank": None, "same_site_url": None, "same_site_rank": None,
            "search_volume": None, "volume_source": None, "main_intent": None,
            "in_suggest": None, "source": None, "dfs_etv": None}


def _analyze_dfs(p: ProductResult, dfs: DataForSEO, opt: Options) -> bool:
    res = dfs.ranked_keywords(p.url, limit=opt.dfs_limit, max_rank=opt.max_rank, cache_days=opt.cache_days)
    p.dfs_total = res["total_count"]
    p.dfs_etv = res["metrics"].get("etv")
    if res.get("from_cache"):
        p.notes.append("DataForSEO: 保存済みの取得結果を再利用(追加料金なし)")
    if not res["items"]:
        p.notes.append("DataForSEO のデータベースにこのURLの順位データがありませんでした"
                       "(小規模サイト・新しいページ・ロングテールのみのページで起こります)")
        return False
    for it in res["items"]:
        row = _base_row(p, it["keyword"])
        row.update(rank=it["rank"], db_rank=it["rank"], rank_kind=M.KIND_DB, rank_date=it["rank_date"],
                   ranking_url=it["ranking_url"], found=True, search_volume=it["search_volume"],
                   volume_source="DataForSEO(Google広告データ等からの推定)" if it["search_volume"] is not None else None,
                   main_intent=it["main_intent"], source="DataForSEO", dfs_etv=it["dfs_etv"])
        p.rows.append(row)
    return True


def _measure(p: ProductResult, serper: Serper, opt: Options, rows: list[dict]) -> None:
    for row in rows:
        serp = serper.serp(row["keyword"], depth=opt.serp_depth, cache_days=min(opt.cache_days, 7))
        rank, other_url, other_rank = find_rank(serp, p.url)
        row["live_rank"] = rank
        row["same_site_url"], row["same_site_rank"] = other_url, other_rank
        if rank:
            row.update(rank=rank, rank_kind=M.KIND_MEASURED, rank_date=serp["checked_at"], found=True,
                       ranking_url=p.url)
        elif row["rank_kind"] == M.KIND_CANDIDATE:
            row["rank_date"] = serp["checked_at"]
            row["not_found_note"] = f"実測で{opt.serp_depth}位以内に無し"
        else:
            row["not_found_note"] = f"実測では{opt.serp_depth}位以内に見つからず(DBの観測後に順位が変わった可能性)"


def analyze_product(label: str, url: str, opt: Options, dfs: DataForSEO | None, serper: Serper | None,
                    imported: pd.DataFrame | None, import_source: str, log: Progress) -> ProductResult:
    p = ProductResult(label=label, url=url)
    if opt.fetch_pages:
        log(f"{label}: 商品ページを取得中…")
        p.page = fetch_page(url)
        if not p.page.ok:
            p.notes.append("商品ページ: " + p.page.status)

    # 1. CSV 取込
    if imported is not None and len(imported):
        p.method = f"{import_source} のCSVを取込"
        for _, r in imported.iterrows():
            row = _base_row(p, str(r["keyword"]))
            rank = r.get("rank")
            rank = int(rank) if pd.notna(rank) else None
            vol = r.get("search_volume")
            row.update(rank=rank, db_rank=rank, rank_kind=M.KIND_IMPORTED, found=rank is not None,
                       rank_date=str(r.get("rank_date")) if pd.notna(r.get("rank_date", None)) else None,
                       ranking_url=r.get("url") if isinstance(r.get("url"), str) else url,
                       search_volume=float(vol) if pd.notna(vol) else None,
                       volume_source=f"{import_source}(推定)" if pd.notna(vol) else None,
                       source=import_source)
            p.rows.append(row)
        return p

    # 2. DataForSEO
    got = False
    if dfs is not None:
        log(f"{label}: DataForSEO から順位付きキーワードを取得中…")
        got = _analyze_dfs(p, dfs, opt)
        if got:
            p.method = "DataForSEO(外部DB)"
            if serper is not None and opt.verify_top > 0:
                top = sorted(p.rows, key=lambda r: -(r["search_volume"] or 0))[:opt.verify_top]
                log(f"{label}: 上位{len(top)}件を実際の検索結果で確認中…")
                _measure(p, serper, opt, top)
                p.method += " + Serper実測確認"

    # 3. 無料モード(候補生成 → 実測)
    if not got:
        if p.page is None or not p.page.ok:
            p.method = p.method or "分析できず"
            p.notes.append("ページ内容を取得できず、候補キーワードを作れませんでした。"
                           "DataForSEO を設定するか、Ahrefs 等のCSVを取り込むと分析できます。")
            return p
        log(f"{label}: ページ内容とGoogleサジェストから候補キーワードを作成中…")
        cands = generate_candidates(p.page, opt.max_candidates, opt.use_suggest)
        for kw, in_sug in cands:
            row = _base_row(p, kw)
            row.update(in_suggest=in_sug, source="候補生成")
            p.rows.append(row)
        if serper is not None:
            log(f"{label}: {len(cands)}件の候補を実際の検索結果で確認中…")
            _measure(p, serper, opt, p.rows)
            p.method = "無料モード: 候補生成 + Serper実測"
        else:
            p.method = "無料モード: 候補生成のみ(順位は未確認)"
        if dfs is not None:
            found_kws = [r["keyword"] for r in p.rows if r["found"]] or [r["keyword"] for r in p.rows]
            vols = dfs.keyword_volumes(found_kws, cache_days=opt.cache_days)
            for r in p.rows:
                v = vols.get(r["keyword"]) or {}
                if v.get("search_volume") is not None:
                    r["search_volume"] = v["search_volume"]
                    r["volume_source"] = "DataForSEO(Google広告データ等からの推定)"
                r["main_intent"] = v.get("main_intent")
            p.method += " + DataForSEO検索ボリューム"
    return p


def finalize_rows(results: list[ProductResult], ai_categories: dict[str, dict[str, list[str]]] | None = None) -> pd.DataFrame:
    """各行に分類・意図・推定クリック・関連性・信頼度を付けて1つの表にする。"""
    ai_categories = ai_categories or {}
    out = []
    for p in results:
        brands = [b for b in (p.page.site_name, p.page.brand) if b] if p.page else []
        for r in p.rows:
            kw = r["keyword"]
            cats = classify(kw)
            cat_source = "辞書ルール"
            if not any(c != "アイテム" for c in cats) and kw in ai_categories:
                cats = {**cats, **ai_categories[kw]}
                cat_source = "AI推定"
            if not any(c != "アイテム" for c in cats):
                cat_source = "未分類"
            if r.get("main_intent") in INTENT_LABELS:
                intent, intent_src = INTENT_LABELS[r["main_intent"]], "DataForSEO(機械学習推定)"
            else:
                intent, intent_src = INTENT_LABELS[rule_intent(kw, brands)], "辞書ルール"
            rel, rel_reason = page_relevance(kw, p.page)
            conf, conf_reason = M.confidence(r["rank_kind"], r["rank"] if r["found"] else None,
                                             M.age_days(r["rank_date"]), r["search_volume"])
            clicks = M.est_clicks(r["search_volume"], r["rank"]) if r["found"] else None
            out.append({
                **r,
                "categories": {c: t for c, t in cats.items() if c != "アイテム"},
                "category_text": format_categories(cats),
                "item": "・".join(cats.get("アイテム", [])),
                "category_source": cat_source,
                "intent": intent, "intent_source": intent_src,
                "est_clicks": clicks,
                "relevance": rel, "relevance_reason": rel_reason,
                "confidence": conf, "confidence_reason": conf_reason,
            })
    df = pd.DataFrame(out)
    if df.empty:
        return df
    return df.sort_values(["product", "found", "est_clicks", "search_volume"],
                          ascending=[True, False, False, False], na_position="last").reset_index(drop=True)


def unclassified_keywords(results: list[ProductResult]) -> list[str]:
    kws = {r["keyword"] for p in results for r in p.rows}
    return sorted(k for k in kws if not any(c != "アイテム" for c in classify(k)))


def run(products: list[tuple[str, str]], opt: Options, dfs: DataForSEO | None, serper: Serper | None,
        imported: dict[str, tuple[pd.DataFrame, str]] | None, log: Progress) -> tuple[list[ProductResult], list[str]]:
    """全商品を分析。返り値: (商品ごとの結果, エラーメッセージ)"""
    imported = imported or {}
    results, errors = [], []
    for label, url in products:
        imp, src = imported.get(canonical_url(url), (None, ""))
        try:
            results.append(analyze_product(label, url, opt, dfs, serper, imp, src, log))
        except (DataForSEOError, SerperError) as e:
            errors.append(f"{label}: {e}")
            results.append(ProductResult(label=label, url=url, method="エラー", notes=[str(e)]))
        except Exception as e:  # noqa: BLE001 - 1商品の想定外のエラーで一括分析全体を止めない
            msg = f"予期しないエラー({type(e).__name__}: {e})"
            errors.append(f"{label}: {msg}")
            results.append(ProductResult(label=label, url=url, method="エラー", notes=[msg]))
    return results, errors


def feature_category_names() -> list[str]:
    return [c for c in CATEGORIES if c != "アイテム"]
