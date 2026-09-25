"""競合の商品ページを1回だけ取得して、タイトル・説明文・本文などを取り出す。

- robots.txt で禁止されているページは取得しない。
- 同じサイトへの連続アクセスは間隔を空ける。
- ページを取得できなくても(ブロック・JavaScript必須など)分析自体は続行する。
  その場合「キーワードとページ内容の関連性」だけが判定できなくなる。
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from .taxonomy import normalize

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)
_HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.5",
            "Accept": "text/html,application/xhtml+xml"}
_last_hit: dict[str, float] = {}
_robots: dict[str, RobotFileParser | None] = {}
MIN_INTERVAL = 2.0  # 同じホストへのアクセス間隔(秒)


@dataclass
class PageInfo:
    url: str
    ok: bool = False
    status: str = ""
    title: str = ""
    h1: str = ""
    description: str = ""
    site_name: str = ""
    brand: str = ""
    product_name: str = ""
    price: str = ""
    breadcrumbs: list[str] = field(default_factory=list)
    body_text: str = ""

    @property
    def headline_text(self) -> str:
        return " ".join([self.title, self.h1, self.product_name])

    @property
    def all_text(self) -> str:
        return " ".join([self.headline_text, self.description, " ".join(self.breadcrumbs), self.body_text])


def canonical_url(url: str) -> str:
    """順位照合用に URL を正規化(http/https・www・末尾スラッシュ・#以降の違いを無視)。"""
    p = urlparse(url.strip())
    host = (p.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = p.path.rstrip("/") or "/"
    return urlunparse(("", host, path, "", p.query, "")).lstrip("/")


def _polite_wait(host: str) -> None:
    wait = MIN_INTERVAL - (time.time() - _last_hit.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last_hit[host] = time.time()


def robots_allows(url: str) -> bool | None:
    """True=許可 / False=禁止 / None=robots.txt を確認できなかった(許可として扱う)。"""
    p = urlparse(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        rp = RobotFileParser()
        try:
            r = requests.get(base + "/robots.txt", headers=_HEADERS, timeout=10)
            if r.status_code >= 400:
                _robots[base] = None
            else:
                rp.parse(r.text.splitlines())
                _robots[base] = rp
        except requests.RequestException:
            _robots[base] = None
    rp = _robots[base]
    if rp is None:
        return None
    return rp.can_fetch("*", url)


def _jsonld_objects(soup: BeautifulSoup):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or tag.get_text() or "")
        except (json.JSONDecodeError, TypeError):
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            obj = stack.pop()
            if isinstance(obj, dict):
                yield obj
                if "@graph" in obj and isinstance(obj["@graph"], list):
                    stack.extend(obj["@graph"])
            elif isinstance(obj, list):
                stack.extend(obj)


def _is_type(obj: dict, name: str) -> bool:
    t = obj.get("@type")
    return t == name or (isinstance(t, list) and name in t)


def fetch_page(url: str, timeout: int = 20) -> PageInfo:
    info = PageInfo(url=url)
    host = urlparse(url).netloc
    allowed = robots_allows(url)
    if allowed is False:
        info.status = "robots.txt で取得が禁止されているため取得しませんでした"
        return info
    _polite_wait(host)
    try:
        r = requests.get(url, headers=_HEADERS, timeout=timeout)
    except requests.RequestException as e:
        info.status = f"接続できませんでした({type(e).__name__})"
        return info
    if r.status_code != 200:
        info.status = f"HTTP {r.status_code}(サイト側で拒否された可能性)"
        return info
    if len(r.content) < 2000:
        info.status = "ページ本文がほぼ空でした(ボット対策やJavaScript必須のサイトの可能性)"
        return info

    soup = BeautifulSoup(r.content, "html.parser")
    for t in soup(["script", "style", "noscript", "svg", "iframe"]):
        if t.name == "script" and t.get("type") == "application/ld+json":
            continue
        t.decompose()

    info.title = (soup.title.get_text(" ", strip=True) if soup.title else "")
    h1 = soup.find("h1")
    info.h1 = h1.get_text(" ", strip=True) if h1 else ""
    meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    info.description = (meta.get("content") or "").strip() if meta else ""
    site = soup.find("meta", attrs={"property": "og:site_name"})
    info.site_name = (site.get("content") or "").strip() if site else ""

    for obj in _jsonld_objects(soup):
        if _is_type(obj, "Product"):
            info.product_name = info.product_name or str(obj.get("name") or "")
            desc = str(obj.get("description") or "")
            if desc and desc not in info.description:
                info.description = (info.description + " " + desc).strip()
            brand = obj.get("brand")
            if isinstance(brand, dict):
                brand = brand.get("name")
            if isinstance(brand, list) and brand:
                brand = brand[0].get("name") if isinstance(brand[0], dict) else brand[0]
            info.brand = info.brand or str(brand or "")
            offers = obj.get("offers")
            if isinstance(offers, list) and offers:
                offers = offers[0]
            if isinstance(offers, dict):
                p = offers.get("price") or offers.get("lowPrice")
                if p:
                    info.price = f"{p} {offers.get('priceCurrency', '')}".strip()
        elif _is_type(obj, "BreadcrumbList"):
            for el in obj.get("itemListElement") or []:
                if isinstance(el, dict):
                    name = el.get("name") or (el.get("item") or {}).get("name") if isinstance(el.get("item"), dict) else el.get("name")
                    if name:
                        info.breadcrumbs.append(str(name))

    for t in soup.find_all("script"):
        t.decompose()
    text = soup.body.get_text(" ", strip=True) if soup.body else soup.get_text(" ", strip=True)
    info.body_text = re.sub(r"\s+", " ", text)[:30000]
    info.ok = True
    info.status = "取得成功" + ("(robots.txt 未確認)" if allowed is None else "")
    return info


def page_relevance(keyword: str, page: PageInfo | None) -> tuple[str, str]:
    """キーワードの各語が商品ページに書かれているか(=事実として確認できること)を見る。

    返り値: (関連性, 根拠)
      高 : すべての語がタイトル/見出し/商品名にある
      中 : すべての語がページ内のどこかにある
      低 : 一部の語がページ内に見つからない
      不明: ページを取得できなかった
    """
    if page is None or not page.ok:
        return "不明", "ページ未取得"
    words = [w for w in normalize(keyword).split(" ") if w]
    head = normalize(page.headline_text)
    body = normalize(page.all_text)
    in_head = [w for w in words if w in head]
    in_body = [w for w in words if w in body]
    missing = [w for w in words if w not in body]
    if words and len(in_head) == len(words):
        return "高", "全語がタイトル/見出しに記載"
    if words and not missing:
        return "中", "全語がページ内に記載"
    return "低", "ページに記載なし: " + "、".join(missing)
