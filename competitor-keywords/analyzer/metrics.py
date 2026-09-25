"""推定クリック数と信頼度の計算。

推定クリック数 = 月間検索ボリューム × 順位別の想定クリック率(CTR)

これは「その順位ならこのくらいクリックされるだろう」というモデル値であり、
競合サイトの実際のアクセス数ではありません。実際のCTRは、広告・ショッピング枠・
画像枠の有無、タイトルの魅力、季節などで大きく変わります。
"""

from __future__ import annotations

from datetime import datetime, timezone

# 自然検索の順位別CTRの目安(公開されている業界調査の値を丸めたもの)。
# 日本の商品系キーワードは広告・ショッピング枠が多く、実際はこれより低いことが多い。
CTR_CURVE = {
    1: 0.28, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05,
    6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.018,
}


def ctr_for(rank: int | None) -> float:
    if not rank or rank < 1:
        return 0.0
    if rank in CTR_CURVE:
        return CTR_CURVE[rank]
    if rank <= 20:
        return 0.008
    if rank <= 30:
        return 0.003
    return 0.001


def est_clicks(volume: float | None, rank: int | None) -> float | None:
    if volume is None or rank is None:
        return None
    return round(volume * ctr_for(rank), 1)


def age_days(ts: str | None) -> int | None:
    """"2025-05-19 22:51:01 +00:00" や ISO 形式の日時から、今日までの経過日数。"""
    if not ts:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(ts, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - dt).days
        except ValueError:
            continue
    return None


# データ種別(画面の「データ種別」列)
KIND_MEASURED = "実測"            # このツールが検索結果を実際に確認した
KIND_DB = "外部DB(推定)"           # SEOデータ会社のデータベース上の観測値・推定値
KIND_IMPORTED = "取込(外部ツール)"  # Ahrefs/Semrush 等からのCSV
KIND_CANDIDATE = "候補(未確認)"     # ページ内容やサジェストから作った候補。順位は未確認


def confidence(rank_kind: str, rank: int | None, rank_age_days: int | None,
               volume: float | None) -> tuple[str, str]:
    """(信頼度, 理由) を返す。

    ここでの信頼度は「この商品ページがこのキーワードで検索結果に出ている」ことの確からしさ。
    推定クリック数の精度ではない(推定クリックは常に「推定」)。
    """
    if rank_kind == KIND_CANDIDATE or rank is None:
        return "低", "順位を確認していない候補"
    if rank_kind == KIND_MEASURED:
        if rank <= 100:
            return "高", "検索結果で実際に確認(確認日時点・日本・非パーソナライズ)"
    reasons = []
    level = 2  # 中
    if rank_age_days is not None and rank_age_days > 60:
        level -= 1
        reasons.append(f"観測が{rank_age_days}日前")
    if rank > 30:
        level -= 1
        reasons.append("順位が30位より下")
    if volume in (None, 0):
        reasons.append("検索ボリューム不明")
    label = {2: "中", 1: "低", 0: "低"}[max(level, 0)]
    base = "外部DBの観測値" if rank_kind == KIND_DB else "外部ツールの値"
    return label, base + ("(" + "・".join(reasons) + ")" if reasons else "")
