"""
Snov.io integration — fallback when Apollo finds nothing.

find_contact(): domain search to find a relevant person at a company (uses prospect quota).
find_email():   email finder by name + domain (costs Snov credits).

Free plan: ~50 email credits/month, ~100 prospect searches/month.
"""
import requests
from pipeline.config import SNOV_CLIENT_ID, SNOV_CLIENT_SECRET, HTTP_TIMEOUT

BASE_URL = "https://api.snov.io"

# Same priority order as Apollo — most relevant for outreach
TITLE_PRIORITY = [
    "ceo", "co-founder", "founder", "cto", "cpo",
    "chief product", "head of product", "vp of product",
    "head of design", "design manager", "hiring manager",
]

_cached_token: str | None = None


def _get_token() -> str | None:
    global _cached_token
    if not (SNOV_CLIENT_ID and SNOV_CLIENT_SECRET):
        return None
    if _cached_token:
        return _cached_token
    try:
        resp = requests.post(
            f"{BASE_URL}/v1/oauth/access_token",
            json={
                "grant_type":    "client_credentials",
                "client_id":     SNOV_CLIENT_ID,
                "client_secret": SNOV_CLIENT_SECRET,
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        _cached_token = resp.json().get("access_token")
        return _cached_token
    except Exception:
        return None


def find_contact(company_name: str, domain: str, employee_count: int | None) -> dict | None:
    """
    Search for the best contact at a company via Snov.io domain search.
    Returns normalized contact dict (same shape as apollo.find_contact) or None.
    apollo_person_id is always None for Snov contacts.
    """
    if not domain:
        return None
    token = _get_token()
    if not token:
        return None

    try:
        resp = requests.get(
            f"{BASE_URL}/v2/domain-emails-with-info",
            params={"domain": domain, "type": "all", "limit": 10},
            headers={"Authorization": f"Bearer {token}"},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Snov.io domain search failed: {e}")

    # Response can nest under "data" or be at the top level
    emails = (data.get("data") or {}).get("emails") or data.get("emails") or []
    if not emails:
        return None

    def title_rank(person: dict) -> int:
        t = (person.get("position") or "").lower()
        for i, kw in enumerate(TITLE_PRIORITY):
            if kw in t:
                return i
        return len(TITLE_PRIORITY)

    best = min(emails, key=title_rank)
    first = best.get("firstName", "")
    last  = best.get("lastName", "")
    name  = f"{first} {last}".strip()
    if not name:
        return None

    return {
        "apollo_person_id": None,           # No Apollo ID
        "name":             name,
        "title":            best.get("position"),
        "linkedin_url":     best.get("linkedInUrl"),
        "seniority":        None,
        "org_name":         company_name,
        "org_website":      f"https://{domain}",
        "org_linkedin":     None,
        # Keep for email fallback lookup later
        "_snov_first":      first,
        "_snov_last":       last,
        "_snov_domain":     domain,
        # Domain search sometimes includes email directly (no credit cost)
        "_snov_email":      best.get("email"),
    }


def find_email(first_name: str, last_name: str, domain: str) -> str | None:
    """
    Find email for a person via Snov.io Email Finder. Costs 1 Snov credit.
    Called ONLY from the dashboard reveal-email route as Apollo fallback.
    """
    token = _get_token()
    if not token:
        return None

    try:
        resp = requests.post(
            f"{BASE_URL}/v1/get-emails-from-name",
            json={
                "first_name":   first_name,
                "last_name":    last_name,
                "domain":       domain,
                "access_token": token,
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Snov.io email finder failed: {e}")

    emails = (data.get("data") or {}).get("emails") or data.get("emails") or []
    if not emails:
        return None

    # Prefer "valid" status; fall back to first result
    valid = [e for e in emails if e.get("emailStatus") in ("valid", "all")]
    return (valid or emails)[0].get("email")
