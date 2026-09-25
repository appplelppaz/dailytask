"""API キーなどの設定と、過去の分析結果の保存(すべてこのPC内の data フォルダに保存)。"""

from __future__ import annotations

import json
import os
import pickle
import re
from datetime import datetime
from pathlib import Path

from .cache import DATA_DIR

_SETTINGS = DATA_DIR / "settings.json"
_RUNS = DATA_DIR / "runs"
_RUNS.mkdir(exist_ok=True)

KEYS = {
    "dataforseo_login": "DATAFORSEO_LOGIN",
    "dataforseo_password": "DATAFORSEO_PASSWORD",
    "serper_key": "SERPER_API_KEY",
    "anthropic_key": "ANTHROPIC_API_KEY",
    "ai_model": "AI_MODEL",
}


def load_settings() -> dict:
    s = {}
    if _SETTINGS.exists():
        try:
            s = json.loads(_SETTINGS.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            s = {}
    for k, env in KEYS.items():
        if not s.get(k) and os.environ.get(env):
            s[k] = os.environ[env]
    return s


def save_settings(s: dict) -> None:
    _SETTINGS.write_text(json.dumps({k: v for k, v in s.items() if v}, ensure_ascii=False, indent=2),
                         encoding="utf-8")


def save_run(name: str, payload: dict) -> Path:
    safe = re.sub(r'[\\/:*?"<>|\s]+', "_", name)[:40]
    path = _RUNS / f"{datetime.now():%Y%m%d_%H%M%S}_{safe}.pkl"
    with open(path, "wb") as f:
        pickle.dump(payload, f)
    return path


def list_runs() -> list[Path]:
    return sorted(_RUNS.glob("*.pkl"), reverse=True)


def load_run(path: Path) -> dict:
    with open(path, "rb") as f:
        return pickle.load(f)
