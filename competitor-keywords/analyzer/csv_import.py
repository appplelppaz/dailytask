"""Ahrefs / Semrush / Ubersuggest などで書き出した「オーガニックキーワード」CSV の取り込み。

すでに Ahrefs などを契約している場合(または無料トライアル中)は、その CSV を
このツールに読み込ませるだけで、分類・比較・商品企画向けの集計ができる。
列名はツールや言語設定によって違うため、よくある名前を自動で対応づける。
"""

from __future__ import annotations

import csv
import io

import pandas as pd

_COLS = {
    "keyword": ["keyword", "キーワード", "keywords"],
    "rank": ["current position", "position", "順位", "現在の順位", "rank", "pos"],
    "search_volume": ["volume", "search volume", "検索ボリューム", "ボリューム", "月間検索数", "vol"],
    "traffic": ["organic traffic", "current organic traffic", "traffic", "current traffic", "トラフィック",
                "推定トラフィック", "オーガニックトラフィック"],
    "url": ["current url", "url", "ランディングページ", "page url", "ページ"],
    "intent": ["keyword intents", "intents", "intent", "検索意図"],
    "rank_date": ["timestamp", "last update", "date", "日付", "更新日"],
}


def _decode(raw: bytes) -> str:
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16")
    for enc in ("utf-8-sig", "cp932"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def read_keyword_csv(raw: bytes, filename: str = "") -> tuple[pd.DataFrame, str]:
    """(標準化した DataFrame, 推定した出典名) を返す。列: keyword, rank, search_volume, traffic, url, intent"""
    text = _decode(raw)
    try:
        dialect = csv.Sniffer().sniff(text[:5000], delimiters=",\t;")
        sep = dialect.delimiter
    except csv.Error:
        sep = "\t" if text.count("\t") > text.count(",") else ","
    df = pd.read_csv(io.StringIO(text), sep=sep)
    lower = {c: str(c).strip().lower() for c in df.columns}
    mapping = {}
    for std, names in _COLS.items():
        for col, lc in lower.items():
            if col in mapping:
                continue
            if lc in names:
                mapping[col] = std
                break
    out = df.rename(columns=mapping)
    if "keyword" not in out.columns:
        raise ValueError("CSV に「Keyword / キーワード」列が見つかりませんでした")
    keep = [c for c in _COLS if c in out.columns]
    out = out[keep].copy()
    for c in ("rank", "search_volume", "traffic"):
        if c in out.columns:
            out[c] = pd.to_numeric(out[c].astype(str).str.replace(",", ""), errors="coerce")
    out = out.dropna(subset=["keyword"])
    name = filename.lower()
    cols = " ".join(lower.values())
    if "ahrefs" in name or "current position" in cols or "organic traffic" in cols:
        source = "Ahrefs"
    elif "semrush" in name or "keyword intents" in cols:
        source = "Semrush"
    else:
        source = "外部ツール"
    return out, source
