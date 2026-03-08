"""
Find a contact's Twitter/X handle using Brave Search API.
Free tier: 2000 queries/month — one query per new contact.

Strategy:
  Search: "{name}" "{company}" site:x.com
  Parse x.com/{handle} from result URLs.
  Bio-verify using the Brave snippet (title + description) — free, same call.

Confidence levels:
  "high"       — snippet mentions company name or crypto/web3 keywords
  "low"        — handle found but snippet has no matching signals
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

# Signals that indicate this is the right person in a crypto/web3 context
_CRYPTO_SIGNALS = re.compile(
    r'\b(crypto|blockchain|web3|web 3|defi|nft|token|founder|co-founder|ceo|cto|'
    r'protocol|wallet|dao|layer 2|l2|solana|ethereum|bitcoin|startup|venture)\b',
    re.IGNORECASE,
)


def _extract_handle(text: str) -> str | None:
    """Only accept profile URLs — reject tweets (/status/), searches, etc."""
    if "/status/" in text.lower():
        return None
    m = _PROFILE_RE.search(text)
    if not m:
        return None
    handle = m.group(1)
    if handle.lower() in _NON_PROFILE:
        return None
    return handle


def _score_snippet(snippet: str, company_name: str) -> str:
    """
    Return 'high' if snippet contains company name or crypto signals, else 'low'.
    Uses the Brave result title+description — no extra API call.
    """
    text = snippet.lower()
    if company_name and company_name.lower() in text:
        return "high"
    if _CRYPTO_SIGNALS.search(snippet):
        return "high"
    return "low"


def find_twitter_handle(name: str, company_name: str) -> tuple[str, str] | tuple[None, None]:
    """
    Search Brave for the contact's Twitter/X profile.
    Returns (url, confidence) where confidence is 'high' or 'low', or (None, None).
    Costs 1 Brave API call.
    """
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
            return None, None  # rate limited — skip silently, not critical
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Brave Search failed: {e}")

    results = data.get("web", {}).get("results", [])
    for result in results:
        handle = _extract_handle(result.get("url", ""))
        if not handle:
            handle = _extract_handle(result.get("description", ""))
        if handle:
            snippet = (result.get("title", "") + " " + result.get("description", ""))
            confidence = _score_snippet(snippet, company_name)
            url = f"https://x.com/{handle}"
            return url, confidence

    time.sleep(0.3)  # be polite between consecutive calls
    return None, None
