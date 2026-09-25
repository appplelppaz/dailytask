import io
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from analyzer import cache, compare, export  # noqa: E402
from analyzer import metrics as M  # noqa: E402
from analyzer import pipeline as P  # noqa: E402
from analyzer.csv_import import read_keyword_csv  # noqa: E402
from analyzer.dataforseo import DataForSEO, _flatten_ranked  # noqa: E402
from analyzer.page import PageInfo, canonical_url, page_relevance  # noqa: E402
from analyzer.serper import find_rank  # noqa: E402
from analyzer.taxonomy import classify, rule_intent  # noqa: E402


@pytest.fixture(autouse=True)
def no_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "_DB", tmp_path / "c.sqlite")


# DataForSEO ranked_keywords の応答(公式ドキュメントの例と同じ構造)
def dfs_item(kw, rank, vol, intent="commercial", url="https://shop.example.jp/item/1"):
    return {
        "se_type": "google",
        "keyword_data": {
            "keyword": kw, "location_code": 2392, "language_code": "ja",
            "keyword_info": {"search_volume": vol, "cpc": 0.5, "last_updated_time": "2026-09-01 00:00:00 +00:00"},
            "search_intent_info": {"main_intent": intent, "foreign_intent": None},
        },
        "ranked_serp_element": {
            "serp_item": {"type": "organic", "rank_group": rank, "rank_absolute": rank + 1, "url": url,
                          "title": "t", "etv": 12.3, "rank_changes": {"is_new": False}},
            "check_url": "https://www.google.co.jp/search?q=x",
            "last_updated_time": "2026-09-10 00:00:00 +00:00",
        },
    }


def dfs_response(items, cost=0.05):
    return {"status_code": 20000, "cost": cost, "tasks": [{
        "status_code": 20000, "status_message": "Ok.",
        "result": [{"target": "x", "total_count": len(items), "items_count": len(items),
                    "metrics": {"organic": {"etv": 321.5, "count": len(items)}}, "items": items}]}]}


class FakeResp:
    def __init__(self, data, status=200):
        self._d, self.status_code = data, status

    def json(self):
        return self._d


def test_classify_examples():
    assert classify("幅広 パンプス") == {"アイテム": ["パンプス"], "幅": ["幅広"]}
    c = classify("外反母趾 パンプス 4E 40代")
    assert c["足の悩み"] == ["外反母趾"] and c["幅"] == ["4E"] and c["年代"] == ["40代"]
    assert classify("スクエアトゥ パンプス")["デザイン"] == ["スクエアトゥ"]
    assert classify("パンプス 5cm ヒール")["ヒール"] == ["ヒール5cm"]
    assert classify("パンプス 23.5cm")["サイズ"] == ["23.5cm"]
    assert classify("カジュアル")["用途"] == ["普段使い"]
    assert "用途" not in classify("casual shoes")  # 「ca」を誤検出しない
    assert classify("就活パンプス")["用途"] == ["就活・リクルート"]


def test_intent_rules():
    assert rule_intent("幅広 パンプス") == "commercial"
    assert rule_intent("パンプス 痛い 対策") == "informational"
    assert rule_intent("パンプス 通販 安い") == "transactional"
    assert rule_intent("ダイアナ パンプス") == "navigational"
    assert rule_intent("gu パンプス") == "navigational"


def test_ctr_and_confidence():
    assert M.est_clicks(1000, 1) == 280.0
    assert M.est_clicks(None, 1) is None
    assert M.confidence(M.KIND_MEASURED, 5, 0, None)[0] == "高"
    assert M.confidence(M.KIND_DB, 5, 10, 100)[0] == "中"
    assert M.confidence(M.KIND_DB, 45, 90, 100)[0] == "低"
    assert M.confidence(M.KIND_CANDIDATE, None, None, None)[0] == "低"


def test_canonical_url_and_find_rank():
    assert canonical_url("https://www.a.jp/item/1/") == canonical_url("http://a.jp/item/1#x")
    serp = {"results": [{"rank": 3, "url": "https://a.jp/cat/pumps"}, {"rank": 7, "url": "https://www.a.jp/item/1/"}]}
    assert find_rank(serp, "https://a.jp/item/1") == (7, None, None)
    assert find_rank(serp, "https://a.jp/item/2") == (None, "https://a.jp/cat/pumps", 3)


def test_page_relevance():
    page = PageInfo(url="u", ok=True, title="幅広 4E 痛くない パンプス", body_text="通勤にも使える本革")
    assert page_relevance("幅広 パンプス", page)[0] == "高"
    assert page_relevance("通勤 パンプス", page)[0] == "中"
    assert page_relevance("40代 パンプス", page) == ("低", "ページに記載なし: 40代")
    assert page_relevance("x", None)[0] == "不明"


def test_dataforseo_parse_and_url_retry(monkeypatch):
    calls = []

    def fake_post(url, auth, json, timeout):
        calls.append(json[0]["target"])
        if len(calls) == 1:  # 1回目(末尾スラッシュ違い)はデータ無し → 表記を変えて再試行
            return FakeResp(dfs_response([], cost=0.012))
        return FakeResp(dfs_response([dfs_item("幅広 パンプス", 4, 12100), dfs_item("外反母趾 パンプス", 7, 6600)]))

    monkeypatch.setattr("analyzer.dataforseo.requests.post", fake_post)
    d = DataForSEO("a", "b")
    res = d.ranked_keywords("https://shop.example.jp/item/1/")
    assert calls == ["https://shop.example.jp/item/1/", "https://shop.example.jp/item/1"]
    assert [i["keyword"] for i in res["items"]] == ["幅広 パンプス", "外反母趾 パンプス"]
    assert res["items"][0]["rank"] == 4 and res["items"][0]["search_volume"] == 12100
    assert res["metrics"]["etv"] == 321.5
    assert d.spent == pytest.approx(0.062)
    # 2回目はキャッシュから(課金なし)
    assert d.ranked_keywords("https://shop.example.jp/item/1/")["from_cache"] is True
    assert len(calls) == 2


def test_dataforseo_balance_error(monkeypatch):
    bad = {"status_code": 20000, "cost": 0, "tasks": [{"status_code": 40200, "status_message": "Payment Required."}]}
    monkeypatch.setattr("analyzer.dataforseo.requests.post", lambda *a, **k: FakeResp(bad))
    with pytest.raises(Exception, match="残高"):
        DataForSEO("a", "b").ranked_keywords("https://x.jp/1")


def test_flatten_handles_missing_fields():
    r = _flatten_ranked({"keyword_data": {"keyword": "k"}, "ranked_serp_element": {}})
    assert r["keyword"] == "k" and r["rank"] is None and r["search_volume"] is None


def test_csv_import_ahrefs_utf16_and_semrush():
    ahrefs = "Keyword\tCurrent position\tVolume\tOrganic traffic\tCurrent URL\n幅広 パンプス\t3\t1,200\t80\thttps://a.jp/1\n"
    df, src = read_keyword_csv(ahrefs.encode("utf-16"), "ahrefs-export.csv")
    assert src == "Ahrefs" and df.loc[0, "rank"] == 3 and df.loc[0, "search_volume"] == 1200
    semrush = "Keyword,Position,Search Volume,Keyword Intents,URL\n外反母趾 パンプス,8,880,commercial,https://b.jp/2\n"
    df, src = read_keyword_csv(semrush.encode("utf-8-sig"), "x.csv")
    assert src == "Semrush" and df.loc[0, "keyword"] == "外反母趾 パンプス"
    sjis = "キーワード,順位,検索ボリューム\n通勤 パンプス,5,500\n".encode("cp932")
    df, _ = read_keyword_csv(sjis, "y.csv")
    assert df.loc[0, "rank"] == 5


class FakeDFS:
    spent = 0.0

    def __init__(self, data):
        self.data = data

    def ranked_keywords(self, url, **kw):
        items = [_flatten_ranked(i) for i in self.data.get(url, [])]
        return {"total_count": len(items), "metrics": {"etv": 100.0} if items else {}, "items": items,
                "from_cache": False}

    def keyword_volumes(self, kws, **kw):
        return {k: {"search_volume": 100, "main_intent": None} for k in kws}


class FakeSerper:
    credits_used = 0

    def __init__(self, serps):
        self.serps = serps

    def serp(self, q, depth=20, cache_days=7):
        return {"query": q, "results": self.serps.get(q, []), "checked_at": "2026-09-25 00:00:00 +0000"}


def test_pipeline_end_to_end(monkeypatch):
    a, b = "https://a.jp/item/1", "https://b.jp/item/2"
    dfs = FakeDFS({a: [dfs_item("幅広 パンプス", 4, 12100, url=a), dfs_item("外反母趾 パンプス", 7, 6600, url=a),
                       dfs_item("40代 パンプス", 15, 2400, url=a)],
                   b: [dfs_item("幅広 パンプス", 9, 12100, url=b), dfs_item("スクエアトゥ パンプス", 3, 1900, url=b)]})
    serper = FakeSerper({"幅広 パンプス": [{"rank": 2, "url": a}]})
    opt = P.Options(fetch_pages=False, verify_top=1)
    results, errors = P.run([("A", a), ("B", b)], opt, dfs, serper, None, lambda m: None)
    assert not errors
    df = P.finalize_rows(results)
    ra = df[(df["product"] == "A") & (df["keyword"] == "幅広 パンプス")].iloc[0]
    assert ra["rank"] == 2 and ra["rank_kind"] == M.KIND_MEASURED and ra["db_rank"] == 4 and ra["confidence"] == "高"
    rb = df[(df["product"] == "B") & (df["keyword"] == "幅広 パンプス")].iloc[0]
    # B は実測では見つからない → DBの順位のまま、メモが付く
    assert "実測では" in rb["not_found_note"] and rb["rank_kind"] == M.KIND_DB

    mat = compare.keyword_matrix(df)
    assert mat.loc["幅広 パンプス", "商品数"] == 2
    assert set(mat[mat["商品数"] == 1].index) == {"外反母趾 パンプス", "40代 パンプス", "スクエアトゥ パンプス"}
    dm = compare.demand_map(df)
    row = dm[(dm["カテゴリー"] == "幅") & (dm["特徴語"] == "幅広")].iloc[0]
    assert row["商品数"] == 2 and row["検索ボリューム合計"] == 12100  # 重複して数えない
    prof = compare.category_profile(df)
    assert prof.loc["A", "足の悩み"] == 1 and prof.loc["A", "年代"] == 1
    summ = compare.product_summary(results, df)
    assert list(summ["表示が確認/観測されたKW数"]) == [3, 2]
    xl = export.to_excel(results, df, {"observations": ["x"], "hypotheses": ["y"], "checks": ["z"]})
    sheets = pd.ExcelFile(io.BytesIO(xl)).sheet_names
    assert {"読み方と注意", "キーワード詳細", "比較(キーワード×商品)", "検索需要マップ", "AI考察(仮説)"} <= set(sheets)
    assert export.to_csv(df)[:3] == b"\xef\xbb\xbf"


def test_free_mode_without_keys(monkeypatch):
    page = PageInfo(url="u", ok=True, title="幅広 4E 外反母趾 痛くない パンプス 通勤", body_text="本革 黒")
    monkeypatch.setattr(P, "fetch_page", lambda url: page)
    monkeypatch.setattr(P, "suggest", lambda q: [q, q + " おすすめ"])
    results, _ = P.run([("A", "https://a.jp/1")], P.Options(), None, None, None, lambda m: None)
    df = P.finalize_rows(results)
    assert "幅広 パンプス" in set(df["keyword"])
    assert (df["rank_kind"] == M.KIND_CANDIDATE).all() and not df["found"].any()
    assert results[0].method.startswith("無料モード")
    # 候補を含めれば比較・需要マップも作れる(セルは「候補」)
    mat = compare.keyword_matrix(df, include_candidates=True)
    assert mat.loc["幅広 パンプス", "A"] == "候補"
    assert not compare.demand_map(df, include_candidates=True).empty
    assert compare.keyword_matrix(df).empty


def test_free_mode_with_serper_and_dfs_fallback(monkeypatch):
    url = "https://a.jp/1"
    page = PageInfo(url=url, ok=True, title="幅広 外反母趾 パンプス")
    monkeypatch.setattr(P, "fetch_page", lambda u: page)
    monkeypatch.setattr(P, "suggest", lambda q: [])
    serper = FakeSerper({"幅広 パンプス": [{"rank": 1, "url": "https://x.jp"}, {"rank": 6, "url": url}]})
    results, _ = P.run([("A", url)], P.Options(), FakeDFS({}), serper, None, lambda m: None)
    df = P.finalize_rows(results)
    hit = df[df["keyword"] == "幅広 パンプス"].iloc[0]
    assert hit["found"] and hit["rank"] == 6 and hit["rank_kind"] == M.KIND_MEASURED
    assert hit["search_volume"] == 100 and hit["est_clicks"] == 4.0
    assert "DBにこのURL" not in results[0].method and "DataForSEO検索ボリューム" in results[0].method
