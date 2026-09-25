"""Google のキーワード候補(サジェスト)。無料。

サジェストに出る = 実際にある程度検索されている語である、という「需要が存在する証拠」には
なるが、検索回数(ボリューム)は分からない。公式に公開された API ではないため、
仕様変更で使えなくなる可能性がある。アクセスは少量・低頻度に抑えている。
"""

from __future__ import annotations

import json
import time

import requests

from . import cache

_URL = "https://suggestqueries.google.com/complete/search"
_last = 0.0


def suggest(query: str, cache_days: float = 14) -> list[str]:
    global _last
    hit = cache.get("suggest", query, cache_days)
    if hit is not None:
        return hit
    wait = 0.7 - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    _last = time.time()
    try:
        r = requests.get(_URL, params={"client": "firefox", "hl": "ja", "gl": "jp", "ie": "utf-8",
                                       "oe": "utf-8", "q": query}, timeout=10)
        data = json.loads(r.content.decode("utf-8", errors="replace"))
        out = [s for s in data[1] if isinstance(s, str)]
    except (requests.RequestException, ValueError, IndexError, TypeError):
        return []
    cache.put("suggest", query, out)
    return out
