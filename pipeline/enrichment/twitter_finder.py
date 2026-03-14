"""
Find a contact's Twitter/X handle.

Data fallback chain (each step tried when previous finds nothing):
  1. Exa tweet-category search (with internal quota rotation: key 1 → key 2)
  2. Brave Search (different index — finds handles Exa may have missed)

Fallback is triggered by "no data found", not by "quota exhausted".
Brave is ALWAYS tried if Exa returns nothing, regardless of why.
"""
import re
import time
import requests
from pipeline.config import BRAVE_API_KEY, HTTP_TIMEOUT
from pipeline.enrichment.exa_finder import find_twitter_handle as _exa_find

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"

_NON_PROFILE = {"i", "search", "home", "explore", "notifications", "messages",
                "settings", "compose", "intent", "share", "hashtag"}

_PROFILE_RE = re.compile(
    r'(?:https?://)?(?:www\.)?(?:twitter\.com|x\.com)/([A-Za-z0-9_]{1,50})(?:[/?#]|$)',
    re.IGNORECASE,
)

_CRYPTO_SIGNALS = re.compile(
    r'\b(crypto|blockchain|web3|web 3|defi|nft|token|founder|co-founder|ceo|cto|'
    r'protocol|wallet|dao|layer 2|l2|solana|ethereum|bitcoin|startup|venture)\b',
    re.IGNORECASE,
)


def _extract_handle(text: str) -> str | None:
    if "/status/" in text.lower():
        return None
    m = _PROFILE_RE.search(text)
    if not m:
        return None
    handle = m.group(1)
    return None if handle.lower() in _NON_PROFILE else handle


def _score_snippet(snippet: str, company_name: str) -> str:
    text = snippet.lower()
    if company_name and company_name.lower() in text:
        return "high"
    if _CRYPTO_SIGNALS.search(snippet):
        return "high"
    return "low"


def _brave_find(name: str, company_name: str) -> tuple[str, str] | tuple[None, None]:
    """Brave Search — different index from Exa, tried when Exa finds nothing."""
    if not BRAVE_API_KEY or not name:
        return None, None

    query = f'"{name}" site:x.com "{company_name}"'
    try:
        resp = requests.get(
            BRAVE_SEARCH_URL,
            headers={
                "Accept":               "application/json",
                "Accept-Encoding":      "gzip",
                "X-Subscription-Token": BRAVE_API_KEY,
            },
            params={"q": query, "count": 5, "search_lang": "en"},
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code == 429:
            return None, None
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Brave Search failed: {e}")

    for result in data.get("web", {}).get("results", []):
        handle = _extract_handle(result.get("url", "")) or _extract_handle(result.get("description", ""))
        if handle:
            snippet    = result.get("title", "") + " " + result.get("description", "")
            confidence = _score_snippet(snippet, company_name)
            return f"https://x.com/{handle}", confidence

    time.sleep(0.3)
    return None, None


def find_twitter_handle(name: str, company_name: str) -> tuple[str, str] | tuple[None, None]:
    """
    Find Twitter/X handle using cascading data sources.
    Each source is tried until one returns a result — stop on first match.

    Step 1 — Exa: returns (url, confidence) or (None, None). Never raises.
    Step 2 — Brave: tried when Exa finds nothing (different index = different coverage).
    """
    # Step 1: Exa (handles internal quota rotation between its own keys)
    url, confidence = _exa_find(name, company_name)
    if url:
        return url, confidence

    # Step 2: Brave — different data source, always try when Exa finds nothing
    return _brave_find(name, company_name)
