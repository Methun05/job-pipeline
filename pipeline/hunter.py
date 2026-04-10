"""
Hunter.io integration — fallback when Apollo finds nothing.

find_contact(): domain search to find the best person at a company (free tier: 25 searches/mo).
find_email():   email finder by first + last + domain (free tier: 25 finder requests/mo).

Docs: https://hunter.io/api-documentation/v2
"""
import time
import requests
from pipeline.config import HUNTER_API_KEY, HTTP_TIMEOUT
from pipeline import tracker

# Hunter free tier: ~6 req/min before 429. 12s gap keeps us safely under.
_HUNTER_RATE_SLEEP = 12

BASE_URL = "https://api.hunter.io/v2"

# Same priority order as Apollo
TITLE_PRIORITY = [
    "ceo", "co-founder", "founder", "cto", "cpo",
    "chief product", "head of product", "vp of product",
    "head of design", "design manager", "hiring manager",
]


def _title_rank(title: str) -> int:
    t = (title or "").lower()
    for i, kw in enumerate(TITLE_PRIORITY):
        if kw in t:
            return i
    return len(TITLE_PRIORITY)


def find_contact(company_name: str, domain: str, employee_count: int | None) -> dict | None:
    """
    Domain search → pick best contact by title priority.
    Returns normalized contact dict (same shape as apollo.find_contact) or None.
    apollo_person_id is always None for Hunter contacts.
    """
    if not domain or not HUNTER_API_KEY:
        return None

    tracker.record_call("hunter")
    time.sleep(_HUNTER_RATE_SLEEP)
    try:
        resp = requests.get(
            f"{BASE_URL}/domain-search",
            params={"domain": domain, "api_key": HUNTER_API_KEY, "limit": 10},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Hunter.io domain search failed: {e}")

    emails = (data.get("data") or {}).get("emails") or []
    if not emails:
        return None

    best = min(emails, key=lambda p: _title_rank(p.get("position", "")))

    first = best.get("first_name") or ""
    last  = best.get("last_name") or ""
    name  = f"{first} {last}".strip()
    if not name:
        return None

    # Normalise Twitter handle → full URL if present
    raw_twitter = best.get("twitter") or ""
    twitter_url = None
    if raw_twitter:
        handle = raw_twitter.lstrip("@")
        twitter_url = f"https://x.com/{handle}" if handle else None

    return {
        "apollo_person_id": None,
        "name":             name,
        "title":            best.get("position"),
        "linkedin_url":     best.get("linkedin"),
        "twitter_url":      twitter_url,
        "seniority":        None,
        "org_name":         company_name,
        "org_website":      f"https://{domain}",
        "org_linkedin":     None,
        "_hunter_first":    first,
        "_hunter_last":     last,
        "_hunter_domain":   domain,
        # Domain search returns emails directly — no credit cost
        "_hunter_email":    best.get("value"),
    }


def find_email(first_name: str, last_name: str, domain: str) -> str | None:
    """
    Email Finder by name + domain. Costs 1 Hunter request.
    Called ONLY from the dashboard reveal-email route as Apollo fallback.
    """
    if not HUNTER_API_KEY:
        return None

    try:
        resp = requests.get(
            f"{BASE_URL}/email-finder",
            params={
                "domain":     domain,
                "first_name": first_name,
                "last_name":  last_name,
                "api_key":    HUNTER_API_KEY,
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Hunter.io email finder failed: {e}")

    return (data.get("data") or {}).get("email") or None
