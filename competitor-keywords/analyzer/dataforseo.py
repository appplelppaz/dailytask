"""DataForSEO Labs API(従量課金)。

ranked_keywords: 指定した URL が Google(日本)で表示されているキーワードの一覧を、
DataForSEO が定期的に観測しているデータベースから返す。Ahrefs の「Organic keywords」と
同じ種類のデータ。料金の目安は 1リクエスト約 $0.012 + 1行あたり約 $0.00012
(300キーワード取得で約 $0.05)。

ここで返る順位は「DataForSEO が最後に観測した時点」の値であり、今この瞬間の順位ではない。
検索ボリュームは Google 広告のデータをもとにした月間平均の推定値。
"""

from __future__ import annotations

from urllib.parse import urlparse, urlunparse

import requests

from . import cache

BASE = "https://api.dataforseo.com/v3"
LOCATION_JP = 2392
LANGUAGE_JA = "ja"


class DataForSEOError(RuntimeError):
    pass


class DataForSEO:
    def __init__(self, login: str, password: str, timeout: int = 90):
        self.auth = (login, password)
        self.timeout = timeout
        self.spent = 0.0  # このセッションで実際に課金された額(API応答の cost の合計)

    def _post(self, path: str, task: dict) -> dict:
        try:
            r = requests.post(f"{BASE}{path}", auth=self.auth, json=[task], timeout=self.timeout)
        except requests.RequestException as e:
            raise DataForSEOError(f"DataForSEO に接続できませんでした: {e}") from e
        if r.status_code == 401:
            raise DataForSEOError("DataForSEO のログイン情報が正しくありません(設定画面で確認してください)")
        try:
            data = r.json()
        except ValueError as e:
            raise DataForSEOError(f"DataForSEO の応答を読めませんでした (HTTP {r.status_code})") from e
        self.spent += float(data.get("cost") or 0)
        if data.get("status_code") != 20000:
            raise DataForSEOError(f"DataForSEO エラー: {data.get('status_message')}")
        t = (data.get("tasks") or [{}])[0]
        if t.get("status_code") != 20000:
            msg = t.get("status_message", "")
            if t.get("status_code") == 40200 or "balance" in msg.lower() or "payment" in msg.lower():
                msg = "DataForSEO の残高が不足しています: " + msg
            raise DataForSEOError(f"DataForSEO エラー: {msg}")
        return t

    def balance(self) -> float | None:
        try:
            r = requests.get(f"{BASE}/appendix/user_data", auth=self.auth, timeout=30)
            d = r.json()
            return float(d["tasks"][0]["result"][0]["money"]["balance"])
        except Exception:  # noqa: BLE001 - 残高表示は補助情報なので失敗しても続行
            return None

    def ranked_keywords(self, url: str, limit: int = 300, max_rank: int = 50,
                        cache_days: float = 30) -> dict:
        """URL の順位付きキーワード。見つからない場合は URL の表記を少し変えて再試行する。"""
        payload = {"url": url, "limit": limit, "max_rank": max_rank}
        hit = cache.get("dfs_ranked", payload, cache_days)
        if hit is not None:
            hit["from_cache"] = True
            return hit

        tried = []
        result = None
        for target in _url_variants(url):
            tried.append(target)
            task = {
                "target": target,
                "location_code": LOCATION_JP,
                "language_code": LANGUAGE_JA,
                "limit": limit,
                "item_types": ["organic"],
                "filters": [["ranked_serp_element.serp_item.rank_group", "<=", max_rank]],
                "order_by": ["keyword_data.keyword_info.search_volume,desc"],
            }
            t = self._post("/dataforseo_labs/google/ranked_keywords/live", task)
            result = (t.get("result") or [None])[0] or {}
            if result.get("items"):
                break
        out = {"target_tried": tried, "total_count": (result or {}).get("total_count") or 0,
               "metrics": ((result or {}).get("metrics") or {}).get("organic") or {},
               "items": [_flatten_ranked(it) for it in (result or {}).get("items") or []],
               "from_cache": False}
        cache.put("dfs_ranked", payload, out)
        return out

    def keyword_volumes(self, keywords: list[str], cache_days: float = 30) -> dict[str, dict]:
        """キーワードごとの月間検索ボリューム・検索意図(DataForSEO の推定値)。"""
        keywords = sorted(set(k for k in keywords if k))
        out: dict[str, dict] = {}
        todo = []
        for k in keywords:
            hit = cache.get("dfs_kw", k, cache_days)
            if hit is not None:
                out[k] = hit
            else:
                todo.append(k)
        for i in range(0, len(todo), 700):
            chunk = todo[i:i + 700]
            t = self._post("/dataforseo_labs/google/keyword_overview/live", {
                "keywords": chunk, "location_code": LOCATION_JP, "language_code": LANGUAGE_JA,
            })
            for it in ((t.get("result") or [{}])[0] or {}).get("items") or []:
                ki = it.get("keyword_info") or {}
                si = it.get("search_intent_info") or {}
                row = {"search_volume": ki.get("search_volume"), "cpc": ki.get("cpc"),
                       "volume_updated": ki.get("last_updated_time"), "main_intent": si.get("main_intent")}
                out[it.get("keyword")] = row
                cache.put("dfs_kw", it.get("keyword"), row)
            for k in chunk:  # データが無かった語も「無い」ことを記録
                if k not in out:
                    out[k] = {"search_volume": None}
                    cache.put("dfs_kw", k, out[k])
        return out


def _url_variants(url: str) -> list[str]:
    p = urlparse(url.strip())
    variants = [url.strip()]
    path = p.path
    alt_path = path[:-1] if path.endswith("/") and len(path) > 1 else path + "/"
    variants.append(urlunparse((p.scheme, p.netloc, alt_path, "", p.query, "")))
    if p.query:
        variants.append(urlunparse((p.scheme, p.netloc, path, "", "", "")))
    seen, uniq = set(), []
    for v in variants:
        if v not in seen:
            seen.add(v)
            uniq.append(v)
    return uniq[:3]


def _flatten_ranked(item: dict) -> dict:
    kd = item.get("keyword_data") or {}
    ki = kd.get("keyword_info") or {}
    si = kd.get("search_intent_info") or {}
    rse = item.get("ranked_serp_element") or {}
    serp = rse.get("serp_item") or {}
    return {
        "keyword": kd.get("keyword"),
        "rank": serp.get("rank_group"),
        "rank_absolute": serp.get("rank_absolute"),
        "ranking_url": serp.get("url"),
        "serp_title": serp.get("title"),
        "rank_date": rse.get("last_updated_time") or (kd.get("serp_info") or {}).get("last_updated_time"),
        "search_volume": ki.get("search_volume"),
        "volume_updated": ki.get("last_updated_time"),
        "cpc": ki.get("cpc"),
        "main_intent": si.get("main_intent"),
        "dfs_etv": serp.get("etv"),
        "is_new": (serp.get("rank_changes") or {}).get("is_new"),
        "check_url": rse.get("check_url"),
    }
