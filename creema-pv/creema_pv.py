"""Creema の特定カテゴリーについて、期間中の閲覧数(PV)を調べる。

Creema の作品ページには「PV(閲覧回数)」の累計が表示されている。これを期間の始めと
終わりに記録し、差を取ると、その期間中の閲覧数になる。

  記録:  python creema_pv.py record  [--category 83] [--top-percent 25]
  比較:  python creema_pv.py compare [開始.csv 終了.csv]

- 記録は「人気の作品」順(Creema の既定の並び)の上位から、指定の割合の作品を対象にする。
  広告(PR)枠の作品は順位に含めない。
- 2回目以降の記録では、1回目に記録した作品が上位から外れていても追いかけて記録する
  (期間の始めと終わりで同じ作品を比べるため)。
- アクセスは1件ずつ、間隔を空けて行う(Creema の robots.txt の「優しくクロールして」に従う)。
- 途中で止まっても、もう一度実行すれば続きから再開する。
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.creema.jp"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    "Accept-Language": "ja",
}
INTERVAL = 2.0  # 1リクエストごとの待ち時間(秒)
SNAP_DIR = Path(__file__).resolve().parent / "snapshots"
FIELDS = ["記録日時", "人気順位", "作品ID", "作品名", "ショップ", "小カテゴリー", "価格", "PV累計",
          "お気に入り累計", "販売数累計", "色", "素材", "URL"]

session = requests.Session()
session.headers.update(HEADERS)


def get(url: str, **params) -> str:
    for attempt in range(4):
        try:
            r = session.get(url, params=params or None, timeout=40)
            if r.status_code == 200:
                return r.text
            if r.status_code == 404:
                return ""
        except requests.RequestException:
            pass
        time.sleep(10 * (attempt + 1))
    return ""


def listing_page(category: str, page: int) -> tuple[list[str], int | None]:
    """人気順一覧の1ページ分。返り値: (広告を除いた作品IDの並び, カテゴリーの総作品数)"""
    soup = BeautifulSoup(get(f"{BASE}/listing/{category}", page=page), "html.parser")
    ids = []
    for li in soup.select("li.p-items-article-list__item"):
        art = li.select_one("article.c-item-article")
        if not art or not art.get("data-id"):
            continue
        if "js-ad-item" in li.get("class", []) or li.select_one(".c-item-article-icon--pr"):
            continue  # PR(広告)枠
        ids.append(art["data-id"])
    total = None
    m = re.search(r"検索結果\s*([\d,]+)\s*件", soup.get_text(" "))
    if m:
        total = int(m.group(1).replace(",", ""))
    return ids, total


def item(item_id: str) -> dict | None:
    url = f"{BASE}/item/{item_id}/detail"
    h = get(url)
    if not h:
        return None

    def num(key: str) -> str:
        m = re.search(r'"%s"\s*:\s*"?(\d+)' % key, h)
        return m.group(1) if m else ""

    row = {"作品ID": item_id, "URL": url, "PV累計": num("pageview"), "お気に入り累計": num("real_favorite_count"),
           "販売数累計": num("count_sold_items")}
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        if not isinstance(d, dict) or d.get("@type") not in ("ProductGroup", "Product"):
            continue
        v = d.get("hasVariant") or d
        if isinstance(v, list):
            v = v[0]
        offers = v.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        row.update({
            "作品名": v.get("name", ""),
            "ショップ": (d.get("brand") or {}).get("name", ""),
            "小カテゴリー": d.get("name", "") if d.get("@type") == "ProductGroup" else "",
            "価格": str(offers.get("price", "")).split(".")[0],
            "色": v.get("color", ""),
            "素材": v.get("material", ""),
        })
        break
    if not row.get("作品名"):
        t = re.search(r"<title>(.*?)</title>", h, re.S)
        row["作品名"] = html.unescape(t.group(1)).split("｜")[0].strip() if t else ""
    return row


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def snapshots(category: str) -> list[Path]:
    return sorted(p for p in SNAP_DIR.glob(f"*_cat{category}.csv"))


def record(category: str, top_percent: float) -> Path:
    SNAP_DIR.mkdir(exist_ok=True)
    partial = sorted(SNAP_DIR.glob(f"*_cat{category}.partial.csv"))
    if partial:
        path = partial[-1]
        print(f"前回の途中から再開します: {path.name}")
    else:
        path = SNAP_DIR / f"{datetime.now():%Y%m%d_%H%M%S}_cat{category}.partial.csv"

    ids_path = path.with_suffix(".ids.json")
    if ids_path.exists():
        targets = json.loads(ids_path.read_text(encoding="utf-8"))
    else:
        first, total = listing_page(category, 1)
        if not total:
            sys.exit("カテゴリーの作品数を読み取れませんでした。カテゴリー番号を確認してください。")
        need = math.ceil(total * top_percent / 100)
        print(f"カテゴリー {category}: 全{total:,}作品 → 上位{top_percent:g}% = {need:,}作品を対象にします")
        ranked: list[str] = []
        page, ids = 1, first
        while True:
            for i in ids:
                if i not in ranked:
                    ranked.append(i)
            print(f"  一覧 {page}ページ目まで: {len(ranked):,}作品", flush=True)
            if len(ranked) >= need or not ids:
                break
            page += 1
            time.sleep(INTERVAL)
            ids, _ = listing_page(category, page)
        targets = [{"id": i, "rank": n} for n, i in enumerate(ranked[:need], 1)]
        # 最初の記録にあった作品は、上位から外れていても追いかける
        done = snapshots(category)
        if done:
            base_ids = {r["作品ID"] for r in read_csv(done[0])}
            have = {t["id"] for t in targets}
            extra = sorted(base_ids - have)
            targets += [{"id": i, "rank": ""} for i in extra]
            if extra:
                print(f"  最初の記録にあり今回の上位に無い {len(extra):,}作品も記録します")
        ids_path.write_text(json.dumps(targets), encoding="utf-8")

    already = {r["作品ID"] for r in read_csv(path)} if path.exists() else set()
    todo = [t for t in targets if t["id"] not in already]
    print(f"作品ページの記録: 残り{len(todo):,}件(約{len(todo) * (INTERVAL + 1.5) / 3600:.1f}時間)", flush=True)
    new_file = not path.exists()
    with open(path, "a", encoding="utf-8-sig" if new_file else "utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        if new_file:
            w.writeheader()
        for n, t in enumerate(todo, 1):
            row = item(t["id"])
            if row is None:
                row = {"作品ID": t["id"], "URL": f"{BASE}/item/{t['id']}/detail", "作品名": "(取得できず/削除済み)"}
            row["人気順位"] = t["rank"]
            row["記録日時"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            w.writerow(row)
            f.flush()
            if n % 50 == 0 or n == len(todo):
                print(f"  {n:,}/{len(todo):,}", flush=True)
            time.sleep(INTERVAL)
    final = path.with_name(path.name.replace(".partial", ""))
    path.rename(final)
    ids_path.unlink(missing_ok=True)
    print(f"記録しました: {final}")
    return final


def _int(v) -> int | None:
    try:
        return int(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def compare(start: Path, end: Path) -> Path:
    import pandas as pd

    a = pd.DataFrame(read_csv(start)).set_index("作品ID")
    b = pd.DataFrame(read_csv(end)).set_index("作品ID")
    ta = pd.to_datetime(a["記録日時"]).min()
    tb = pd.to_datetime(b["記録日時"]).min()
    days = max((tb - ta).total_seconds() / 86400, 1e-9)
    both = a.index.intersection(b.index)
    # このツール自身の記録(作品ページを開くこと)も PV に1回数えられる。
    # 開始〜終了の間に行った記録の回数(開始を含み終了を含まない)を作品ごとに数えて差し引く。
    own: dict[str, int] = {}
    for snap in SNAP_DIR.glob("*_cat*.csv"):
        if ".partial" in snap.name or not (start.name <= snap.name < end.name):
            continue
        if snap.name.split("_cat")[1] != start.name.split("_cat")[1]:
            continue
        for r in read_csv(snap):
            own[r["作品ID"]] = own.get(r["作品ID"], 0) + 1
    rows = []
    for i in both:
        ra, rb = a.loc[i], b.loc[i]
        pa, pb = _int(ra["PV累計"]), _int(rb["PV累計"])
        if pa is None or pb is None:
            continue
        rows.append({
            "作品ID": i, "作品名": rb["作品名"] or ra["作品名"], "ショップ": rb["ショップ"] or ra["ショップ"],
            "小カテゴリー": rb["小カテゴリー"] or ra["小カテゴリー"], "価格": _int(rb["価格"]),
            "開始時の人気順位": _int(ra["人気順位"]), "終了時の人気順位": _int(rb["人気順位"]),
            "期間PV": max(pb - pa - own.get(i, 1), 0),
            "期間お気に入り増": (_int(rb["お気に入り累計"]) or 0) - (_int(ra["お気に入り累計"]) or 0),
            "期間販売数増(参考)": (_int(rb["販売数累計"]) or 0) - (_int(ra["販売数累計"]) or 0),
            "PV累計(終了時)": pb, "URL": rb["URL"],
        })
    df = pd.DataFrame(rows).sort_values("期間PV", ascending=False)
    total = int(df["期間PV"].sum())
    bins = [0, 3000, 5000, 8000, 12000, 20000, 10**9]
    labels = ["〜2,999円", "3,000〜4,999円", "5,000〜7,999円", "8,000〜11,999円", "12,000〜19,999円", "20,000円〜"]
    df["価格帯"] = pd.cut(df["価格"], bins=bins, labels=labels, right=False)

    def group(key):
        g = df.groupby(key, observed=True).agg(作品数=("作品ID", "count"), 期間PV=("期間PV", "sum"),
                                              期間お気に入り増=("期間お気に入り増", "sum"),
                                              期間販売数増=("期間販売数増(参考)", "sum"))
        g["PVシェア"] = (g["期間PV"] / max(total, 1)).round(3)
        return g.sort_values("期間PV", ascending=False).reset_index()

    summary = pd.DataFrame([
        ("開始の記録", f"{ta:%Y-%m-%d %H:%M}({start.name})"),
        ("終了の記録", f"{tb:%Y-%m-%d %H:%M}({end.name})"),
        ("期間", f"{days:.1f}日"),
        ("比較できた作品数", f"{len(df):,}(開始{len(a):,}・終了{len(b):,})"),
        ("期間PV合計", f"{total:,}"),
        ("1日あたりPV", f"{total / days:,.0f}"),
        ("期間お気に入り増 合計", f"{int(df['期間お気に入り増'].sum()):,}"),
        ("注意", "PVは Creema 内の閲覧回数(作品ページに表示される累計値の差)。検索エンジンからの流入数ではない。"
               "このツールの記録で作品ページを開いた回数は差し引き済み。"
               "対象は開始時の人気上位作品で、カテゴリー全体ではない。"
               "販売数増はページ内データ count_sold_items の差で、意味は Creema 非公開のため参考値。"),
    ], columns=["項目", "値"])
    out = end.with_name(f"比較_{start.stem}_to_{end.stem}.xlsx")
    with pd.ExcelWriter(out, engine="openpyxl") as xw:
        summary.to_excel(xw, sheet_name="概要", index=False)
        df.to_excel(xw, sheet_name="作品別", index=False)
        group("小カテゴリー").to_excel(xw, sheet_name="小カテゴリー別", index=False)
        group("ショップ").to_excel(xw, sheet_name="ショップ別", index=False)
        group("価格帯").to_excel(xw, sheet_name="価格帯別", index=False)
        for ws in xw.book.worksheets:
            for col in ws.columns:
                width = max(len(str(c.value or "")) for c in col[:300])
                ws.column_dimensions[col[0].column_letter].width = min(max(8, width * 1.7), 60)
    print(summary.to_string(index=False))
    print(f"\n結果: {out}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record", help="今の PV を記録する")
    r.add_argument("--category", default="83", help="カテゴリー番号(83 = シューズ・靴)")
    r.add_argument("--top-percent", type=float, default=25, help="人気順の上位何%%を対象にするか")
    c = sub.add_parser("compare", help="2回の記録を比べて期間中の PV を出す")
    c.add_argument("files", nargs="*", help="開始と終了の CSV(省略時は最初と最新)")
    c.add_argument("--category", default="83")
    args = ap.parse_args()
    if args.cmd == "record":
        record(args.category, args.top_percent)
    else:
        if len(args.files) == 2:
            start, end = map(Path, args.files)
        else:
            snaps = snapshots(args.category)
            if len(snaps) < 2:
                sys.exit("記録が2回分必要です。期間の始めと終わりに「記録する」を実行してください。")
            start, end = snaps[0], snaps[-1]
        compare(start, end)


if __name__ == "__main__":
    main()
