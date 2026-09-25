"""(任意)Claude API による補助。API キーが無ければ使われない。

1. 辞書で分類できなかったキーワードのカテゴリー付け  → 画面では「AI推定」と表示
2. 集計結果から商品企画の観点でのメモを作成          → 「AIの考察(仮説)」と表示

AI には集計済みの数値だけを渡し、データにない事実を断定しないよう指示している。
それでも AI の出力は推測なので、画面上は常に実データと区別して表示する。
"""

from __future__ import annotations

import json

import anthropic
from pydantic import BaseModel

from .taxonomy import CATEGORIES

DEFAULT_MODEL = "claude-opus-5"


class _KwCat(BaseModel):
    keyword: str
    category: str
    term: str


class _KwCats(BaseModel):
    items: list[_KwCat]


class AIError(RuntimeError):
    pass


def _client(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key)


def _parse(client: anthropic.Anthropic, model: str, prompt: str, fmt, max_tokens: int = 16000):
    try:
        resp = client.beta.messages.parse(
            model=model,
            max_tokens=max_tokens,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": prompt}],
            output_format=fmt,
        )
    except anthropic.AuthenticationError as e:
        raise AIError("Claude の API キーが正しくありません") from e
    except anthropic.RateLimitError as e:
        raise AIError("Claude API の利用上限に達しました。しばらく待って再実行してください") from e
    except anthropic.APIStatusError as e:
        raise AIError(f"Claude API エラー ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise AIError("Claude API に接続できませんでした") from e
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise AIError("AI が回答を返しませんでした")
    return resp.parsed_output


def classify_keywords(api_key: str, keywords: list[str], model: str = DEFAULT_MODEL) -> dict[str, dict[str, list[str]]]:
    """辞書で分類できなかったキーワードを AI にカテゴリー分けさせる。"""
    if not keywords:
        return {}
    cats = [c for c in CATEGORIES if c != "アイテム"] + ["その他"]
    out: dict[str, dict[str, list[str]]] = {}
    client = _client(api_key)
    for i in range(0, len(keywords), 150):
        chunk = keywords[i:i + 150]
        prompt = (
            "あなたは女性靴ECの商品企画担当を補助します。以下は検索キーワードです。"
            "各キーワードが、靴のどの特徴・ニーズに関する検索かを分類してください。\n"
            f"使えるカテゴリー: {', '.join(cats)}\n"
            "term にはキーワード中の該当語(例: 幅広, 外反母趾, 通勤)を短く入れてください。"
            "1つのキーワードに複数の特徴があれば複数行に分けてください。"
            "当てはまらない場合は category を「その他」にしてください。推測で意味を足さないでください。\n\n"
            + "\n".join(chunk)
        )
        parsed = _parse(client, model, prompt, _KwCats)
        for it in parsed.items:
            if it.keyword in chunk and it.category in cats and it.category != "その他":
                out.setdefault(it.keyword, {}).setdefault(it.category, [])
                if it.term not in out[it.keyword][it.category]:
                    out[it.keyword][it.category].append(it.term)
    return out


class _Memo(BaseModel):
    observations: list[str]
    hypotheses: list[str]
    checks: list[str]


def planning_memo(api_key: str, summary: dict, model: str = DEFAULT_MODEL) -> _Memo:
    """集計データから、商品企画のための観察・仮説・確認事項を作る。"""
    prompt = (
        "あなたは女性靴ECの商品企画を補助するアナリストです。以下は競合商品ページが検索エンジンで"
        "表示されているキーワードを集計したデータです(JSON)。\n"
        "注意:\n"
        "- 順位や検索ボリュームは外部データベースの推定値や一時点の観測値であり、競合の実際のアクセス数ではありません。\n"
        "- 推定クリック数はモデル値です。実際の流入数として書かないでください。\n"
        "- observations には、データから直接読み取れることだけを、根拠の数字を添えて書いてください。\n"
        "- hypotheses には、商品企画・商品ページ作成に向けた仮説を書き、断定せず「〜の可能性」と書いてください。\n"
        "- checks には、仮説を確かめるために人が確認すべきこと(実際の検索結果、レビュー、自社データなど)を書いてください。\n"
        "- 日本語で、各項目は1〜2文で簡潔に。\n\n"
        + json.dumps(summary, ensure_ascii=False)
    )
    return _parse(_client(api_key), model, prompt, _Memo)
