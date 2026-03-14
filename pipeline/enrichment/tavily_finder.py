"""
Tavily search enrichment — Twitter handle and company LinkedIn lookup.

Position in fallback chain:
  Twitter:          Exa (1→2) → Tavily → Brave
  Company LinkedIn: Exa (1→2) → Tavily → Hunter

Free tier: 1,000 API credits/month (basic search = 1 credit).
Triggered when Exa finds nothing — different index = different coverage.
"""
import re
import requests
from pipeline.config import TAVILY_API_KEY, HTTP_TIMEOUT

TAVILY_URL = "https://api.tavily.com/search"

_PROFILE_RE = re.compile(
    r'(?:https?://)?(?:www\.)?(?:x\.com|twitter\.com)/([A-Za-z0-9_]{1,50})(?:[/?#]|$)',
    re.IGNORECASE,
)

_LINKEDIN_CO_RE = re.compile(
    r'(?:https?://)?(?:[a-z]{2}\.)?linkedin\.com/company/([A-Za-z0-9_%-]+)(?:[/?]|$)',
    re.IGNORECASE,
)

_NON_PROFILE = {"i", "search", "home", "explore", "notifications", "messages",
                "settings", "compose", "intent", "share", "hashtag", "jobs",
                "about", "highlights", "following", "followers", "likes",
                "status", "with_replies", "media"}

_CRYPTO_SIGNALS = re.compile(
    r'\b(crypto|blockchain|web3|defi|nft|token|founder|co-founder|ceo|cto|'
    r'protocol|wallet|dao|layer\s*2|solana|ethereum|bitcoin|startup|venture)\b',
    re.IGNORECASE,
)


def _tavily_search(query: str, include_domains: list[str], max_results: int = 5) -> list[dict]:
    if not TAVILY_API_KEY:
        return []
    try:
        resp = requests.post(
            TAVILY_URL,
            json={
                "api_key":        TAVILY_API_KEY,
                "query":          query,
                "search_depth":   "basic",
                "max_results":    max_results,
                "include_domains": include_domains,
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as e:
        raise RuntimeError(f"Tavily search failed: {e}")


def _score_snippet(text: str, company_name: str) -> str:
    t = text.lower()
    if company_name and company_name.lower() in t:
        return "high"
    if _CRYPTO_SIGNALS.search(text):
        return "high"
    return "low"


def _extract_handle(url: str) -> str | None:
    """Extract Twitter handle from URL, reject non-profile paths."""
    m = _PROFILE_RE.search(url)
    if not m:
        return None
    handle = m.group(1)
    if handle.lower() in _NON_PROFILE:
        return None
    return handle


def find_twitter_handle(name: str, company_name: str) -> tuple[str, str] | tuple[None, None]:
    """
    Search Tavily for a Twitter/X profile.
    Returns (url, confidence) or (None, None).
    """
    if not name or not TAVILY_API_KEY:
        return None, None

    try:
        results = _tavily_search(
            f"{name} {company_name}",
            include_domains=["x.com", "twitter.com"],
        )
    except Exception:
        return None, None

    # Prefer profile URLs over tweet/status URLs
    profile_hits = []
    tweet_hits   = []

    for r in results:
        url    = r.get("url", "")
        handle = _extract_handle(url)
        if not handle:
            continue
        if "/status/" in url.lower():
            tweet_hits.append((handle, r))
        else:
            profile_hits.append((handle, r))

    # Use first profile hit; fall back to tweet hit (extract author handle)
    candidates = profile_hits or tweet_hits
    if not candidates:
        return None, None

    handle, r = candidates[0]
    snippet    = r.get("title", "") + " " + r.get("content", "")
    confidence = _score_snippet(snippet, company_name)
    return f"https://x.com/{handle}", confidence


def find_company_domain(company_name: str) -> str | None:
    """
    Search Tavily for a company's official website domain.
    Returns bare domain (e.g. 'mystenlabs.com') or None.
    """
    if not TAVILY_API_KEY:
        return None

    from pipeline.dedup.matcher import normalize_domain

    try:
        results = _tavily_search(
            f"{company_name} crypto official website",
            include_domains=[],
            max_results=5,
        )
    except Exception:
        return None

    skip = {"linkedin", "twitter", "x.com", "crunchbase", "techcrunch",
            "coindesk", "cointelegraph", "web3.career", "cryptojobslist",
            "decrypt.co", "blockworks.co", "theblock.co"}

    for r in results:
        url = r.get("url", "")
        if any(s in url for s in skip):
            continue
        domain = normalize_domain(url)
        if domain:
            return domain

    return None


def find_company_linkedin(company_name: str, domain: str = "") -> str | None:
    """
    Search Tavily for a company's LinkedIn page.
    Returns linkedin.com/company/... URL or None.
    """
    if not TAVILY_API_KEY:
        return None

    query = f"{company_name} {domain}".strip() if domain else f"{company_name} crypto web3"

    try:
        results = _tavily_search(query, include_domains=["linkedin.com/company"])
    except Exception:
        return None

    for r in results:
        url = r.get("url", "")
        if _LINKEDIN_CO_RE.search(url):
            return url.split("?")[0].rstrip("/")

    return None
