import email.utils
import json
import os
import time
import urllib.request
from xml.etree import ElementTree as ET

SOURCES_FILE = os.getenv("NEWS_SOURCES_FILE", "/app/config/news_sources.json")
CACHE_TTL_SECONDS = 600
ARTICLES_PER_CATEGORY = 30
ARTICLES_PER_SOURCE = 15
FETCH_TIMEOUT_SECONDS = 10

ATOM_NS = "{http://www.w3.org/2005/Atom}"

_cache: dict[str, tuple[float, list]] = {}


def load_sources() -> dict:
    with open(SOURCES_FILE) as f:
        return json.load(f)


def _parse_date(text: str) -> float:
    if not text:
        return 0
    parsed = email.utils.parsedate_tz(text)
    if parsed:
        return email.utils.mktime_tz(parsed)
    try:
        return time.mktime(time.strptime(text[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        return 0


def _fetch_source(name: str, url: str) -> list[dict]:
    request = urllib.request.Request(url, headers={"User-Agent": "home-lab-news/1.0"})
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
        root = ET.fromstring(response.read())

    items = root.findall(".//item")
    if items:
        articles = []
        for item in items[:ARTICLES_PER_SOURCE]:
            published = item.findtext("pubDate") or ""
            articles.append(
                {
                    "title": (item.findtext("title") or "").strip(),
                    "link": (item.findtext("link") or "").strip(),
                    "published": published,
                    "published_ts": _parse_date(published),
                    "source": name,
                }
            )
        return articles

    articles = []
    for entry in root.findall(f".//{ATOM_NS}entry")[:ARTICLES_PER_SOURCE]:
        link_el = entry.find(f"{ATOM_NS}link")
        published = entry.findtext(f"{ATOM_NS}published") or entry.findtext(f"{ATOM_NS}updated") or ""
        articles.append(
            {
                "title": (entry.findtext(f"{ATOM_NS}title") or "").strip(),
                "link": link_el.get("href") if link_el is not None else "",
                "published": published,
                "published_ts": _parse_date(published),
                "source": name,
            }
        )
    return articles


def get_category_articles(category: str, sources: list[dict]) -> list[dict]:
    cached = _cache.get(category)
    now = time.time()
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    articles = []
    for src in sources:
        try:
            articles.extend(_fetch_source(src["name"], src["url"]))
        except Exception:
            continue

    articles.sort(key=lambda a: a["published_ts"], reverse=True)
    articles = articles[:ARTICLES_PER_CATEGORY]
    _cache[category] = (now, articles)
    return articles
