"""
Find a contact's Twitter/X handle using Brave Search API.
Free tier: 2000 queries/month — one query per new contact.

Strategy:
  Search: "{name}" "{company}" site:x.com
  Parse x.com/{handle} from result URLs.
  Ignore known non-profile paths (/i/, /search, /home, /explore, /notifications).
"""
import re
import time
import requests
from pipeline.config import BRAVE_API_KEY, HTTP_TIMEOUT

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"

# x.com paths that are NOT user profiles
_NON_PROFILE = {"i", "search", "home", "explore", "notifications", "messages",
                "settings", "compose", "intent", "share", "hashtag"}

_PROFILE_RE = re.compile(
    r'(?:https?://)?(?:www\.)?(?:twitter\.com|x\.com)/([A-Za-z0-9_]{1,50})(?:[/?#]|$)',
    re.IGNORECASE,
)


def _extract_handle(url: str) -> str | None:
    """Only accept profile URLs — reject tweets (/status/), searches, etc."""
    if "/status/" in url.lower():
        return None
    m = _PROFILE_RE.search(url)
    if not m:
        return None
    handle = m.group(1)
    if handle.lower() in _NON_PROFILE:
        return None
    return handle


def find_twitter_handle(name: str, company_name: str) -> str | None:
    """
    Search Brave for the contact's Twitter/X profile.
    Returns full x.com URL or None.
    Costs 1 Brave API call.
    """
    if not BRAVE_API_KEY or not name:
        return None

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
            return None  # rate limited — skip silently, not critical
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Brave Search failed: {e}")

    results = data.get("web", {}).get("results", [])
    for result in results:
        # Check URL first
        handle = _extract_handle(result.get("url", ""))
        if handle:
            return f"https://x.com/{handle}"
        # Also scan description in case URL is a redirect
        handle = _extract_handle(result.get("description", ""))
        if handle:
            return f"https://x.com/{handle}"

    time.sleep(0.3)  # be polite between consecutive calls
    return None
