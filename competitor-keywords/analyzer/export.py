"""画面表示用の列名と、Excel / CSV への書き出し。"""

from __future__ import annotations

import io
from datetime import datetime

import pandas as pd

from . import compare

# 内部の列名 → 画面・Excelでの列名(並び順もこの順)
DISPLAY_COLUMNS = {
    "product": "商品",
    "keyword": "キーワード",
    "rank": "順位",
    "rank_kind": "データ種別",
    "confidence": "信頼度",
    "search_volume": "月間検索ボリューム(推定)",
    "est_clicks": "推定クリック/月(モデル値)",
    "intent": "検索意図(推定)",
    "category_text": "カテゴリー",
    "category_source": "分類方法",
    "relevance": "ページ内容との関連性",
    "relevance_reason": "関連性の根拠",
    "item": "アイテム",
    "rank_date": "順位の観測日時",
    "confidence_reason": "信頼度の理由",
    "db_rank": "順位(外部DB/取込)",
    "live_rank": "順位(実測)",
    "not_found_note": "実測メモ",
    "same_site_url": "同サイトの別ページが表示",
    "same_site_rank": "その順位",
    "in_suggest": "Googleサジェストに存在",
    "volume_source": "ボリュームの出典",
    "intent_source": "検索意図の出典",
    "ranking_url": "表示されたURL",
    "dfs_etv": "DataForSEO推定トラフィック(参考)",
    "source": "取得元",
    "product_url": "商品URL",
}

COMPACT = ["keyword", "rank", "rank_kind", "confidence", "search_volume", "est_clicks", "intent",
           "category_text", "relevance"]


def to_display(df: pd.DataFrame, cols: list[str] | None = None) -> pd.DataFrame:
    if df.empty:
        return df
    cols = [c for c in (cols or list(DISPLAY_COLUMNS)) if c in df.columns]
    out = df[cols].rename(columns=DISPLAY_COLUMNS).copy()
    for c in out.columns:  # 空の値は「None」ではなく空欄で表示
        if out[c].dtype == object:
            out[c] = out[c].where(out[c].notna(), "")
    if "Googleサジェストに存在" in out.columns:
        out["Googleサジェストに存在"] = out["Googleサジェストに存在"].map({True: "あり", False: "なし"}).fillna("")
    return out


README_ROWS = [
    ("このファイルについて", "競合商品ページが検索エンジンでどのキーワードと結びついているかの分析結果です。"),
    ("作成日時", ""),
    ("データ種別: 実測", "このツールが Google の検索結果(日本・日本語・ログインなし)を実際に確認した順位。確認した日時点の値。"),
    ("データ種別: 外部DB(推定)", "DataForSEO が定期的に観測したデータベース上の順位。観測日が古いと現在と異なる場合があります。"),
    ("データ種別: 取込(外部ツール)", "Ahrefs / Semrush などから書き出したCSVの値。"),
    ("データ種別: 候補(未確認)", "商品ページの内容と Google サジェストから作った候補。実際に検索結果に出ているかは未確認です。"),
    ("月間検索ボリューム(推定)", "Google 広告データ等をもとにした外部サービスの推定値。実際の検索回数ではありません。"),
    ("推定クリック/月(モデル値)", "検索ボリューム × 順位ごとの一般的なクリック率 で計算したモデル値。競合の実際のアクセス数ではありません。"),
    ("検索意図(推定)", "DataForSEO の機械学習推定、またはこのツールの辞書ルールによる推定。"),
    ("カテゴリー", "辞書ルール(語の一致)で分類。「AI推定」と書かれたものは AI による分類で、確認が必要です。"),
    ("ページ内容との関連性", "キーワードの語が商品ページに書かれているかの確認結果(高=タイトル/見出しに記載、中=本文に記載、低=記載なし)。"),
    ("信頼度", "その商品ページがそのキーワードで検索結果に出ていることの確からしさ(高=実測、中=外部DBの新しい観測、低=古い観測・下位・未確認)。"),
]


def to_excel(results, df: pd.DataFrame, ai_memo: dict | None = None, include_candidates: bool = False) -> bytes:
    buf = io.BytesIO()
    readme = pd.DataFrame(README_ROWS, columns=["項目", "説明"])
    readme.loc[1, "説明"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    if include_candidates:
        readme.loc[len(readme)] = ["集計対象", "比較・需要マップ・カテゴリー構成には、順位を確認していない「候補」も含めています。"]
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        readme.to_excel(xw, sheet_name="読み方と注意", index=False)
        compare.product_summary(results, df).to_excel(xw, sheet_name="商品サマリー", index=False)
        to_display(df).to_excel(xw, sheet_name="キーワード詳細", index=False)
        mat = compare.keyword_matrix(df, include_candidates)
        if not mat.empty:
            mat.to_excel(xw, sheet_name="比較(キーワード×商品)")
        dm = compare.demand_map(df, include_candidates)
        if not dm.empty:
            dm.to_excel(xw, sheet_name="検索需要マップ", index=False)
        prof = compare.category_profile(df, include_candidates=include_candidates)
        if not prof.empty:
            prof.to_excel(xw, sheet_name="カテゴリー構成")
        if ai_memo:
            rows = [("AIの観察(データから読み取れること)", x) for x in ai_memo.get("observations", [])]
            rows += [("AIの仮説(推測)", x) for x in ai_memo.get("hypotheses", [])]
            rows += [("確認すべきこと", x) for x in ai_memo.get("checks", [])]
            pd.DataFrame(rows, columns=["種類", "内容"]).to_excel(xw, sheet_name="AI考察(仮説)", index=False)
        for ws in xw.book.worksheets:
            for col in ws.columns:
                width = max(len(str(c.value or "")) for c in col[:200])
                ws.column_dimensions[col[0].column_letter].width = min(max(8, width * 1.6), 60)
            ws.freeze_panes = "B2"
    return buf.getvalue()


def to_csv(df: pd.DataFrame) -> bytes:
    # Excel で文字化けしないよう BOM 付き UTF-8
    return to_display(df).to_csv(index=False).encode("utf-8-sig")
