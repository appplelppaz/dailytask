"""複数商品の比較・市場全体の検索需要の集計。"""

from __future__ import annotations

import pandas as pd

from . import metrics as M
from .pipeline import ProductResult, feature_category_names


def found_rows(df: pd.DataFrame, include_candidates: bool = False) -> pd.DataFrame:
    """集計対象の行。

    include_candidates=True のときは、順位を確認していない候補(=ページの内容から見て
    その商品が狙っていると考えられるキーワード)も含める。実測して上位に無かった行は含めない。
    """
    if df.empty:
        return df
    mask = df["found"]
    if include_candidates:
        mask = mask | ((df["rank_kind"] == M.KIND_CANDIDATE) & df["rank_date"].isna())
    return df[mask]


def product_summary(results: list[ProductResult], df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    f = found_rows(df)
    for p in results:
        d = f[f["product"] == p.label] if not f.empty else f
        cat_count: dict[str, float] = {}
        for _, r in d.iterrows():
            for c in r["categories"]:
                cat_count[c] = cat_count.get(c, 0) + (r["est_clicks"] or 0) + 0.001
        top_cats = sorted(cat_count, key=cat_count.get, reverse=True)[:4]
        rows.append({
            "商品": p.label,
            "URL": p.url,
            "取得方法": p.method,
            "表示が確認/観測されたKW数": len(d),
            "うち10位以内": int((d["rank"] <= 10).sum()) if len(d) else 0,
            "推定クリック合計/月(モデル値)": round(float(d["est_clicks"].fillna(0).sum()), 1) if len(d) else None,
            "DataForSEO推定トラフィック/月(参考)": round(p.dfs_etv, 1) if p.dfs_etv is not None else None,
            "DB上の全KW数": p.dfs_total,
            "主な需要カテゴリー": "、".join(top_cats),
            "ページ取得": (p.page.status if p.page else "未取得"),
            "メモ": " / ".join(p.notes),
        })
    return pd.DataFrame(rows)


def keyword_matrix(df: pd.DataFrame, include_candidates: bool = False) -> pd.DataFrame:
    """キーワード × 商品 の順位表。「商品数」が多いほど複数の競合が共通して獲得している需要。

    セルは「4位」のような順位、候補を含める場合の未確認分は「候補」。
    """
    f = found_rows(df, include_candidates)
    if f.empty:
        return pd.DataFrame()
    f = f.assign(cell=[f"{int(r)}位" if ok and pd.notna(r) else "候補"
                       for r, ok in zip(f["rank"], f["found"])])
    ranks = f[f["found"]].pivot_table(index="keyword", columns="product", values="rank", aggfunc="min")
    piv = f.sort_values("rank", na_position="last").pivot_table(index="keyword", columns="product", values="cell",
                                                                aggfunc="first")
    meta = f.groupby("keyword").agg(
        検索ボリューム=("search_volume", "max"),
        カテゴリー=("category_text", "first"),
        検索意図=("intent", "first"),
        推定クリック合計=("est_clicks", "sum"),
    )
    out = meta.join(piv)
    out.index.name = "キーワード"
    out.insert(0, "商品数", piv.notna().sum(axis=1))
    out.insert(1, "最高順位", ranks.min(axis=1).reindex(out.index) if not ranks.empty else None)
    return out.sort_values(["商品数", "検索ボリューム", "推定クリック合計"], ascending=False, na_position="last")


def category_profile(df: pd.DataFrame, weight: str = "count", include_candidates: bool = False) -> pd.DataFrame:
    """商品 × カテゴリー。weight='count' はキーワード数、'clicks' は推定クリック(モデル値)の合計。"""
    f = found_rows(df, include_candidates)
    cats = feature_category_names()
    if f.empty:
        return pd.DataFrame(columns=cats)
    recs = []
    for _, r in f.iterrows():
        for c in r["categories"]:
            recs.append({"商品": r["product"], "カテゴリー": c,
                         "w": 1 if weight == "count" else (r["est_clicks"] or 0)})
    if not recs:
        return pd.DataFrame(columns=cats)
    t = pd.DataFrame(recs).pivot_table(index="商品", columns="カテゴリー", values="w", aggfunc="sum", fill_value=0)
    return t[[c for c in cats if c in t.columns]]


def demand_map(df: pd.DataFrame, include_candidates: bool = False) -> pd.DataFrame:
    """市場全体の検索需要マップ: 特徴語ごとに、関連キーワード数・検索ボリューム合計・獲得している商品数。

    検索ボリューム合計は、同じキーワードを重複して数えないよう1キーワード1回で合計する。
    """
    f = found_rows(df, include_candidates)
    if f.empty:
        return pd.DataFrame()
    recs = []
    for _, r in f.iterrows():
        for c, terms in r["categories"].items():
            for t in terms:
                recs.append({"カテゴリー": c, "特徴語": t, "keyword": r["keyword"], "product": r["product"],
                             "vol": r["search_volume"], "rank": r["rank"], "clicks": r["est_clicks"] or 0})
    if not recs:
        return pd.DataFrame()
    x = pd.DataFrame(recs)
    x["vol"] = pd.to_numeric(x["vol"], errors="coerce")
    kw_vol = x.drop_duplicates(["カテゴリー", "特徴語", "keyword"])
    g = kw_vol.groupby(["カテゴリー", "特徴語"]).agg(キーワード数=("keyword", "nunique"),
                                                    検索ボリューム合計=("vol", lambda s: s.sum(min_count=1)))
    g2 = x.groupby(["カテゴリー", "特徴語"]).agg(商品数=("product", "nunique"), 最高順位=("rank", "min"),
                                               推定クリック合計=("clicks", "sum"))
    ex = kw_vol.sort_values("vol", ascending=False, na_position="last").groupby(["カテゴリー", "特徴語"])["keyword"] \
        .apply(lambda s: "、".join(list(s)[:4])).rename("キーワード例")
    out = g.join(g2).join(ex).reset_index()
    return out.sort_values(["検索ボリューム合計", "商品数", "キーワード数"], ascending=False, na_position="last")


def ai_summary_payload(results: list[ProductResult], df: pd.DataFrame, include_candidates: bool = False,
                       top_n: int = 40) -> dict:
    """AI に渡す集計データ(生データではなく要約した数値のみ)。"""
    mat = keyword_matrix(df, include_candidates)
    dm = demand_map(df, include_candidates)
    note = "順位・検索ボリュームは外部DBの推定値または一時点の実測。推定クリックはモデル値。"
    if include_candidates:
        note += "「候補」は商品ページの記載とGoogleサジェストから作ったもので、検索結果に出ているかは未確認。"
    return {
        "注意": note,
        "商品数": len(results),
        "商品別": product_summary(results, df)[["商品", "表示が確認/観測されたKW数", "うち10位以内",
                                               "推定クリック合計/月(モデル値)", "主な需要カテゴリー"]].to_dict("records"),
        "需要マップ上位": dm.head(top_n).fillna("").to_dict("records") if not dm.empty else [],
        "共通キーワード上位": mat[mat["商品数"] >= 2].head(top_n)[["商品数", "最高順位", "検索ボリューム", "カテゴリー"]]
        .reset_index().fillna("").to_dict("records") if not mat.empty else [],
    }
