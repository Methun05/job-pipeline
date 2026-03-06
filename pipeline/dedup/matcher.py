"""
Deduplication logic.
Step 1: domain normalization (exact match, 100% certain)
Step 2: fuzzy name matching with RapidFuzz (fallback when no domain)
"""
import re
from urllib.parse import urlparse
from rapidfuzz import fuzz
from pipeline.config import DEDUP_FUZZY_THRESHOLD

LEGAL_SUFFIXES = re.compile(
    r'\b(inc|ltd|llc|corp|co|gmbh|sas|bv|ag|pty|plc|limited|incorporated)\b\.?',
    re.IGNORECASE
)


def normalize_domain(url: str) -> str:
    """
    app.cryptox.io  → cryptox.io
    https://www.example.com/careers → example.com
    """
    if not url:
        return ""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        parsed = urlparse(url)
        host = parsed.netloc or parsed.path
        host = host.lower()
        # strip www. and common subdomains
        for prefix in ("www.", "app.", "careers.", "jobs.", "about.", "blog."):
            if host.startswith(prefix):
                host = host[len(prefix):]
        return host.split("/")[0]   # strip any path that crept in
    except Exception:
        return url.lower()


def normalize_name(name: str) -> str:
    name = LEGAL_SUFFIXES.sub("", name)
    return re.sub(r'\s+', ' ', name).strip().lower()


def find_company_match(
    name: str,
    domain: str,
    existing_companies: list[dict],
) -> str | None:
    """
    Returns matching company_id or None.
    existing_companies: list of {id, name, domain} from DB.
    """
    # Step 1 — domain exact match
    if domain:
        for c in existing_companies:
            if c.get("domain") and normalize_domain(c["domain"]) == domain:
                return c["id"]

    # Step 2 — fuzzy name match
    norm_name = normalize_name(name)
    for c in existing_companies:
        score = fuzz.token_set_ratio(norm_name, normalize_name(c.get("name", "")))
        if score >= DEDUP_FUZZY_THRESHOLD:
            return c["id"]

    return None
