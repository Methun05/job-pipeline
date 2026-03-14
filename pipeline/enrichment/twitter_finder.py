"""
Find a contact's Twitter/X handle.

Data fallback chain (each step tried when previous finds nothing):
  1. Exa  — tweet-category search (quota rotation: key 1 → key 2)
  2. Tavily — different index, tried when Exa finds nothing
  3. Brave  — last resort, different index again

Fallback is triggered by "no data found", not by "quota exhausted".
Each source is always tried until one returns a result.
"""
import re
import time
import requests
from pipeline.config import BRAVE_API_KEY, HTTP_TIMEOUT
from pipeline.enrichment.exa_finder import find_twitter_handle as _exa_find
from pipeline.enrichment.tavily_finder import find_twitter_handle as _tavily_find

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
    Cascading Twitter/X handle search — stop on first result found.

    Step 1 — Exa:    tweet-category, handles internal key 1→2 quota rotation
    Step 2 — Tavily: different index, tried when Exa finds nothing
    Step 3 — Brave:  last resort, different index
    """
    # Step 1: Exa
    url, confidence = _exa_find(name, company_name)
    if url:
        return url, confidence

    # Step 2: Tavily
    url, confidence = _tavily_find(name, company_name)
    if url:
        return url, confidence

    # Step 3: Brave
    return _brave_find(name, company_name)
