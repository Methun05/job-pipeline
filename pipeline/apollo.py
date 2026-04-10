"""
Apollo.io integration.

Auth: ALL requests require X-Api-Key header (query param returns 422).

Organization Enrich (/organizations/enrich) — FREE, no credits.
  Returns LinkedIn, Twitter, website for any domain. Best source for company socials.

People Search (/mixed_people/search) — FREE, no credits.
  Returns person name, title, linkedin_url. Email is NOT included (use reveal for that).
  Note: free tier returns 0 results for many companies — Hunter is more reliable.

Email Reveal (/people/match) — 1 credit each.
  ONLY called from dashboard API route, never from pipeline.
"""
import time
import requests
from pipeline.config import APOLLO_API_KEY, HTTP_TIMEOUT, APOLLO_CREDIT_ALERT
import pipeline.db as db
from pipeline import tracker

BASE_URL     = "https://api.apollo.io/v1"
BASE_URL_NEW = "https://api.apollo.io/api/v1"

_HEADERS = None

def _headers() -> dict:
    global _HEADERS
    if _HEADERS is None:
        _HEADERS = {"Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY}
    return _HEADERS


# Title priority lists per company size
TITLES_SMALL  = ["CEO", "Co-Founder", "Founder", "CTO"]
TITLES_MID    = ["CPO", "Chief Product Officer", "Head of Product", "VP of Product"]
TITLES_LARGE  = ["Head of Design", "Design Manager", "Hiring Manager", "Head of Product"]


def _titles_for_size(employee_count: int | None) -> list[str]:
    if employee_count is None or employee_count < 20:
        return TITLES_SMALL
    if employee_count < 50:
        return TITLES_MID
    return TITLES_LARGE


def enrich_company(domain: str) -> dict:
    """
    Apollo /organizations/enrich — FREE, no credits consumed.
    Returns dict with linkedin_url, twitter_url, website_url, name, employee_count.
    Best first-stop for company social enrichment — accurate and free.
    """
    if not APOLLO_API_KEY or not domain:
        return {}
    try:
        tracker.record_call("apollo")
        resp = requests.get(
            f"{BASE_URL}/organizations/enrich",
            params={"domain": domain},
            headers=_headers(),
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        org = resp.json().get("organization") or {}
        return {
            "name":           org.get("name"),
            "linkedin_url":   org.get("linkedin_url"),
            "twitter_url":    org.get("twitter_url"),
            "website_url":    org.get("website_url"),
            "employee_count": org.get("estimated_num_employees"),
        }
    except Exception:
        return {}


def find_contact(company_name: str, domain: str, employee_count: int | None) -> dict | None:
    """
    Search for the best contact at a company using Apollo People Search.
    Returns normalized contact dict or None.
    Zero credits consumed.
    """
    if not APOLLO_API_KEY:
        return None

    time.sleep(1.2)  # stay under 50 req/min rate limit
    tracker.record_call("apollo")

    titles = _titles_for_size(employee_count)

    payload = {
        "person_titles": titles,
        "page":          1,
        "per_page":      1,
    }
    if domain:
        payload["q_organization_domains"] = [domain]
    else:
        payload["q_organization_name"] = company_name

    try:
        resp = requests.post(
            f"{BASE_URL_NEW}/mixed_people/api_search",
            json=payload,
            headers=_headers(),
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        body = e.response.text if e.response is not None else ""
        raise RuntimeError(f"Apollo People Search failed: {e} | body: {body[:300]}")
    except Exception as e:
        raise RuntimeError(f"Apollo People Search failed: {e}")

    people = data.get("people", [])
    if not people:
        return None

    person = people[0]
    org = person.get("organization") or {}
    return {
        "apollo_person_id": person.get("id"),
        "name":             f"{person.get('first_name', '')} {person.get('last_name', '')}".strip(),
        "title":            person.get("title"),
        "linkedin_url":     person.get("linkedin_url"),
        "seniority":        person.get("seniority"),
        "org_name":         org.get("name"),
        "org_website":      org.get("website_url") or org.get("primary_domain"),
        "org_linkedin":     org.get("linkedin_url"),
    }


def get_credit_balance() -> int | None:
    """
    Apollo /auth/health only returns {healthy, is_logged_in} — no credit info.
    We return a fixed sentinel (270) so the dashboard doesn't block email reveal.
    Actual usage is tracked in the Apollo dashboard.
    """
    if not APOLLO_API_KEY:
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/auth/health",
            headers=_headers(),
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("is_logged_in"):
            # API doesn't return credit counts — return sentinel so pipeline knows key is valid
            return 270
        return None
    except Exception:
        return None


def reveal_email(apollo_person_id: str) -> str | None:
    """
    Reveal email for a person. Costs 1 credit.
    Called ONLY from the Next.js API route (dashboard), never from pipeline.
    """
    if not APOLLO_API_KEY:
        return None

    try:
        resp = requests.post(
            f"{BASE_URL}/people/match",
            json={
                "id":                      apollo_person_id,
                "reveal_personal_emails":  False,
                "reveal_phone_number":     False,
            },
            headers=_headers(),
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data   = resp.json()
        person = data.get("person", {})
        return person.get("email")
    except Exception as e:
        raise RuntimeError(f"Apollo email reveal failed: {e}")
