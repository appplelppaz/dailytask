"""有料APIの結果をローカルに保存して、同じURLを何度も分析しても再課金されないようにする。"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
_DB = DATA_DIR / "cache.sqlite"


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_DB)
    c.execute("CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, ts REAL, v TEXT)")
    return c


def _key(namespace: str, payload) -> str:
    raw = namespace + json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


def get(namespace: str, payload, max_age_days: float):
    if max_age_days <= 0:
        return None
    with _conn() as c:
        row = c.execute("SELECT ts, v FROM cache WHERE k=?", (_key(namespace, payload),)).fetchone()
    if not row or time.time() - row[0] > max_age_days * 86400:
        return None
    return json.loads(row[1])


def put(namespace: str, payload, value) -> None:
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO cache VALUES (?,?,?)",
                  (_key(namespace, payload), time.time(), json.dumps(value, ensure_ascii=False)))
