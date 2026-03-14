"""
Exa.ai enrichment — Twitter handle lookup and company LinkedIn search.

Free tier: 1,000 requests/month.
Docs: https://exa.ai/docs

find_twitter_handle(): tweet category search → extract handle from tweet URL
find_company_linkedin(): include_domains=['linkedin.com/company'] → company page URL
"""
import re
import time
from pipeline.config import EXA_API_KEY, HTTP_TIMEOUT

_exa = None

_NON_PROFILE = {"i", "search", "home", "explore", "notifications",
                "messages", "settings", "compose", "intent", "share",
                "hashtag", "jobs", "about"}

# Matches x.com/{handle}/status/... or just x.com/{handle}
_TWEET_RE = re.compile(
    r'(?:https?://)?(?:www\.)?x\.com/([A-Za-z0-9_]{1,50})(?:/status/|/?$)',
    re.IGNORECASE,
)

_LINKEDIN_CO_RE = re.compile(
    r'(?:https?://)?(?:[a-z]{2}\.)?linkedin\.com/company/([A-Za-z0-9_%-]+)(?:[/?]|$)',
    re.IGNORECASE,
)

_CRYPTO_SIGNALS = re.compile(
    r'\b(crypto|blockchain|web3|defi|nft|token|founder|co-founder|ceo|cto|'
    r'protocol|wallet|dao|layer\s*2|solana|ethereum|bitcoin|startup|venture)\b',
    re.IGNORECASE,
)


def _get_exa():
    global _exa
    if _exa is None:
        if not EXA_API_KEY:
            return None
        from exa_py import Exa
        _exa = Exa(api_key=EXA_API_KEY)
    return _exa


def _score_snippet(snippet: str, company_name: str) -> str:
    text = snippet.lower()
    if company_name and company_name.lower() in text:
        return "high"
    if _CRYPTO_SIGNALS.search(snippet):
        return "high"
    return "low"


def find_twitter_handle(name: str, company_name: str) -> tuple[str, str] | tuple[None, None]:
    """
    Search Exa (tweet category) for a contact's Twitter/X handle.
    Extracts handle from tweet URLs like x.com/{handle}/status/...
    Returns (url, confidence) or (None, None).
    """
    if not name:
        return None, None
    exa = _get_exa()
    if not exa:
        return None, None

    try:
        results = exa.search(
            f"{name} {company_name}",
            type="auto",
            num_results=5,
            category="tweet",
        )
        time.sleep(0.3)
    except Exception as e:
        raise RuntimeError(f"Exa tweet search failed: {e}")

    seen_handles: set[str] = set()
    for r in results.results:
        url = r.url or ""
        m = _TWEET_RE.search(url)
        if not m:
            continue
        handle = m.group(1)
        if handle.lower() in _NON_PROFILE or handle in seen_handles:
            continue
        seen_handles.add(handle)
        snippet    = r.title or ""
        confidence = _score_snippet(snippet + " " + company_name, company_name)
        return f"https://x.com/{handle}", confidence

    return None, None


def find_company_linkedin(company_name: str, domain: str = "") -> str | None:
    """
    Search Exa for a company's LinkedIn page.
    Returns the linkedin.com/company/... URL or None.
    """
    exa = _get_exa()
    if not exa:
        return None

    query = f"{company_name} crypto web3"
    if domain:
        query = f"{company_name} {domain}"

    try:
        results = exa.search(
            query,
            type="auto",
            num_results=5,
            include_domains=["linkedin.com/company"],
        )
        time.sleep(0.3)
    except Exception as e:
        raise RuntimeError(f"Exa LinkedIn search failed: {e}")

    for r in results.results:
        url = r.url or ""
        if _LINKEDIN_CO_RE.search(url):
            return url.split("?")[0].rstrip("/")

    return None
