"""
Exa.ai enrichment — Twitter handle lookup and company LinkedIn search.

Key concept — two distinct fallback reasons:

  1. QUOTA fallback (Exa key 1 → Exa key 2):
     Same index, same data. Only useful for doubling free-tier quota.
     Triggered by: API errors, rate limits, quota exhaustion.

  2. DATA fallback (Exa → Hunter for LinkedIn, Exa → Brave for Twitter):
     Different data sources with different indexes.
     Triggered by: Exa simply didn't find anything (no error needed).
     Brave/Hunter may find what Exa missed — always try them when Exa returns nothing.

Free tier: 1,000 requests/month per Exa key.
"""
import re
import time
import requests
from pipeline.config import EXA_API_KEY, EXA_API_KEY_2, HUNTER_API_KEY, HTTP_TIMEOUT

# ── Exa client pool (quota rotation only — same data, double the free tier) ───
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
    return clients[_active_idx] if clients else None


def _rotate_key() -> bool:
    """Rotate to next key on quota/error. Returns True if rotated."""
    global _active_idx
    clients = _get_clients()
    if _active_idx + 1 < len(clients):
        _active_idx += 1
        print(f"[Exa] Key {_active_idx} quota hit — rotating to key {_active_idx + 1}")
        return True
    return False


def _exa_search(query: str, **kwargs) -> list:
    """
    Run an Exa search. Rotates keys on quota/error (quota fallback).
    Returns result list (may be empty). Raises if all keys fail.
    Note: empty results ≠ error — caller handles data fallback separately.
    """
    clients = _get_clients()
    if not clients:
        raise RuntimeError("No Exa API keys configured.")

    for _ in range(len(clients)):
        client = _active_client()
        try:
            results = client.search(query, **kwargs)
            time.sleep(0.3)
            return results.results  # may be [] — not an error
        except Exception as e:
            err = str(e).lower()
            is_quota = any(kw in err for kw in ("quota", "rate", "429", "limit", "exceeded"))
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


# ── Public functions ───────────────────────────────────────────────────────────

def find_twitter_handle(name: str, company_name: str) -> tuple[str, str] | tuple[None, None]:
    """
    Search Exa (tweet category) for a Twitter/X handle.
    Returns (url, confidence) or (None, None) if nothing found.
    Returns None (not raises) on quota exhaustion — caller tries Brave next.
    """
    if not name or not _get_clients():
        return None, None

    try:
        results = _exa_search(
            f"{name} {company_name}",
            type="auto",
            num_results=5,
            category="tweet",
        )
    except Exception:
        return None, None  # Exa fully down — caller will try Brave

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

    return None, None  # Nothing found — caller will try Brave


def _hunter_company_linkedin(domain: str) -> str | None:
    """Hunter.io /companies/find — data fallback for company LinkedIn."""
    if not HUNTER_API_KEY or not domain:
        return None
    try:
        resp = requests.get(
            "https://api.hunter.io/v2/companies/find",
            params={"domain": domain, "api_key": HUNTER_API_KEY},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        return (resp.json().get("data") or {}).get("linkedin") or None
    except Exception:
        return None


def find_company_linkedin(company_name: str, domain: str = "") -> str | None:
    """
    Find a company's LinkedIn page URL.

    Data fallback chain (each step tried when previous finds nothing):
      1. Exa search (with quota rotation between key 1 and key 2)
      2. Hunter.io /companies/find (different data source)

    Returns linkedin.com/company/... URL or None.
    """
    # ── Step 1: Exa (with internal quota rotation key 1 → key 2) ─────────────
    if _get_clients():
        try:
            query   = f"{company_name} {domain}".strip() if domain else f"{company_name} crypto web3"
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
            pass  # Exa fully down — move to Hunter

    # ── Step 2: Hunter (different data source — tried whenever Exa finds nothing)
    return _hunter_company_linkedin(domain)
