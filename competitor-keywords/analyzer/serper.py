"""Serper.dev(Google 検索結果 API)で、今この時点の順位を実際に確認する。

Google の検索結果を自分のプログラムで直接取得(スクレイピング)することは Google の
利用規約で禁止されているため、このツールは直接アクセスせず、検索結果を提供する
外部 API を使う。Serper は登録時に 2,500 回分が無料、その後は 1,000 回あたり約 $1。
確認結果は「日本・日本語・ログインなし」の検索結果で、個人ごとの検索結果とは異なることがある。
"""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from . import cache
from .page import canonical_url

ENDPOINT = "https://google.serper.dev/search"


class SerperError(RuntimeError):
    pass


class Serper:
    def __init__(self, api_key: str, timeout: int = 30):
        self.key = api_key
        self.timeout = timeout
        self.credits_used = 0

    def _page(self, query: str, page: int) -> list[dict]:
        try:
            r = requests.post(ENDPOINT, headers={"X-API-KEY": self.key, "Content-Type": "application/json"},
                              json={"q": query, "gl": "jp", "hl": "ja", "num": 10, "page": page},
                              timeout=self.timeout)
        except requests.RequestException as e:
            raise SerperError(f"Serper に接続できませんでした: {e}") from e
        if r.status_code in (401, 403):
            raise SerperError("Serper の API キーが正しくないか、無料枠を使い切っています")
        if r.status_code != 200:
            raise SerperError(f"Serper エラー (HTTP {r.status_code}): {r.text[:200]}")
        data = r.json()
        self.credits_used += int(data.get("credits") or 1)
        return data.get("organic") or []

    def serp(self, query: str, depth: int = 20, cache_days: float = 7) -> dict:
        """上位 depth 件までの自然検索結果。

        同じキーワードを複数の競合商品で使い回せるよう、商品が見つかっても途中でやめずに
        depth 件まで取得してキャッシュする(1ページ=10件=1クレジット)。
        """
        payload = {"q": query, "depth": depth}
        hit = cache.get("serper", payload, cache_days)
        if hit is not None:
            hit["from_cache"] = True
            return hit
        results: list[dict] = []
        for page in range(1, max(1, depth // 10) + 1):
            organic = self._page(query, page)
            for i, o in enumerate(organic):
                results.append({"rank": (page - 1) * 10 + i + 1, "url": o.get("link"), "title": o.get("title")})
            if len(organic) < 10:
                break
        out = {"query": query, "results": results,
               "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S %z"), "from_cache": False}
        cache.put("serper", payload, out)
        return out


def _find(results: list[dict], url: str) -> dict | None:
    target = canonical_url(url)
    for r in results:
        if r.get("url") and canonical_url(r["url"]) == target:
            return r
    return None


def find_rank(serp: dict, url: str) -> tuple[int | None, str | None, int | None]:
    """(商品ページの順位, 同じサイトの別ページのURL, その順位)。"""
    hit = _find(serp["results"], url)
    if hit:
        return hit["rank"], None, None
    host = canonical_url(url).split("/")[0]
    for r in serp["results"]:
        if r.get("url") and canonical_url(r["url"]).split("/")[0] == host:
            return None, r["url"], r["rank"]
    return None, None, None
