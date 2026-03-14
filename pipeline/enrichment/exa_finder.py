"""
Exa.ai enrichment — Twitter handle lookup and company LinkedIn search.

Client pool: EXA_API_KEY → EXA_API_KEY_2 (auto-rotates on quota/rate error).
For company LinkedIn: Exa pool → Hunter.io company enrichment as final fallback.
For Twitter: called by twitter_finder.py which then falls back to Brave.

Free tier: 1,000 requests/month per key.
Docs: https://exa.ai/docs
"""
import re
import time
import requests
from pipeline.config import EXA_API_KEY, EXA_API_KEY_2, HUNTER_API_KEY, HTTP_TIMEOUT

# ── Client pool ────────────────────────────────────────────────────────────────
_clients: list | None = None
_active_idx: int      = 0


def _get_clients() -> list:
    global _clients
    if _clients is None:
        from exa_py import Exa
        pool = []
        if EXA_API_KEY:
            pool.append(Exa(api_key=EXA_API_KEY))
        if EXA_API_KEY_2:
            pool.append(Exa(api_key=EXA_API_KEY_2))
        _clients = pool
    return _clients


def _active_client():
    clients = _get_clients()
    if not clients:
        return None
    return clients[_active_idx]


def _rotate_key() -> bool:
    """Switch to next Exa key. Returns True if rotated, False if none left."""
    global _active_idx
    clients = _get_clients()
    if _active_idx + 1 < len(clients):
        _active_idx += 1
        print(f"[Exa] Key #{_active_idx} quota hit — switching to key #{_active_idx + 1}")
        return True
    return False


def _exa_search(query: str, **kwargs) -> list:
    """
    Run an Exa search with automatic key rotation on quota errors.
    Returns list of result objects, or raises if all keys exhausted.
    """
    clients = _get_clients()
    if not clients:
        raise RuntimeError("No Exa API keys configured.")

    for key_attempt in range(len(clients)):
        client = _active_client()
        if client is None:
            break
        try:
            results = client.search(query, **kwargs)
            time.sleep(0.3)
            return results.results
        except Exception as e:
            err = str(e).lower()
            is_quota = "quota" in err or "rate" in err or "429" in err or "limit" in err
            if is_quota and _rotate_key():
                continue
            raise

    raise RuntimeError("All Exa API keys exhausted.")


# ── Regex helpers ──────────────────────────────────────────────────────────────
_NON_PROFILE = {"i", "search", "home", "explore", "notifications",
                "messages", "settings", "compose", "intent", "share",
                "hashtag", "jobs", "about"}

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


def _score_snippet(snippet: str, company_name: str) -> str:
    text = snippet.lower()
    if company_name and company_name.lower() in text:
        return "high"
    if _CRYPTO_SIGNALS.search(snippet):
        return "high"
    return "low"


# ── Public API ─────────────────────────────────────────────────────────────────

def find_twitter_handle(name: str, company_name: str) -> tuple[str, str] | tuple[None, None]:
    """
    Search Exa (tweet category) for a contact's Twitter/X handle.
    Extracts handle from tweet URLs: x.com/{handle}/status/...
    Returns (url, confidence) or (None, None).
    Raises on Exa failure — caller (twitter_finder.py) falls back to Brave.
    """
    if not name or not _get_clients():
        return None, None

    results = _exa_search(
        f"{name} {company_name}",
        type="auto",
        num_results=5,
        category="tweet",
    )

    seen: set[str] = set()
    for r in results:
        url = r.url or ""
        m   = _TWEET_RE.search(url)
        if not m:
            continue
        handle = m.group(1)
        if handle.lower() in _NON_PROFILE or handle in seen:
            continue
        seen.add(handle)
        snippet    = r.title or ""
        confidence = _score_snippet(snippet + " " + company_name, company_name)
        return f"https://x.com/{handle}", confidence

    return None, None


def _hunter_company_linkedin(company_name: str, domain: str) -> str | None:
    """
    Hunter.io company enrichment as final fallback for LinkedIn.
    Uses /v2/companies/find — free tier, already have the key.
    """
    if not HUNTER_API_KEY or not domain:
        return None
    try:
        resp = requests.get(
            "https://api.hunter.io/v2/companies/find",
            params={"domain": domain, "api_key": HUNTER_API_KEY},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return (data.get("data") or {}).get("linkedin") or None
    except Exception:
        return None


def find_company_linkedin(company_name: str, domain: str = "") -> str | None:
    """
    Find a company's LinkedIn page URL.
    Chain: Exa 1 → Exa 2 → Hunter.io company enrichment.
    Returns linkedin.com/company/... URL or None.
    """
    # ── Exa pool ──────────────────────────────────────────────────────────────
    if _get_clients():
        try:
            query = f"{company_name} {domain}".strip() if domain else f"{company_name} crypto web3"
            results = _exa_search(
                query,
                type="auto",
                num_results=5,
                include_domains=["linkedin.com/company"],
            )
            for r in results:
                url = r.url or ""
                if _LINKEDIN_CO_RE.search(url):
                    return url.split("?")[0].rstrip("/")
        except Exception:
            pass  # All Exa keys failed — fall through to Hunter

    # ── Hunter fallback ───────────────────────────────────────────────────────
    return _hunter_company_linkedin(company_name, domain)
