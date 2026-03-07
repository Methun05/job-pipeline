"""
Apollo.io integration.

People Search (/mixed_people/search) — ZERO credits, used freely by pipeline.
Email Reveal (/people/match) — 1 credit each, ONLY called from dashboard API route.

Rate limits: 50 req/min, 600/day for People Search.
"""
import requests
from pipeline.config import APOLLO_API_KEY, HTTP_TIMEOUT, APOLLO_CREDIT_ALERT
import pipeline.db as db

BASE_URL = "https://api.apollo.io/v1"

# Title priority lists per company size
TITLES_SMALL  = ["CEO", "Co-Founder", "Founder", "CTO"]           # <20 employees
TITLES_MID    = ["CPO", "Chief Product Officer", "Head of Product", "VP of Product"]  # 20-50
TITLES_LARGE  = ["Head of Design", "Design Manager", "Hiring Manager", "Head of Product"]  # 50+


def _titles_for_size(employee_count: int | None) -> list[str]:
    if employee_count is None or employee_count < 20:
        return TITLES_SMALL
    if employee_count < 50:
        return TITLES_MID
    return TITLES_LARGE


def find_contact(company_name: str, domain: str, employee_count: int | None) -> dict | None:
    """
    Search for the best contact at a company using Apollo People Search.
    Returns normalized contact dict or None.
    Zero credits consumed.
    """
    if not APOLLO_API_KEY:
        return None

    titles = _titles_for_size(employee_count)

    payload = {
        "api_key":      APOLLO_API_KEY,
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
            f"{BASE_URL}/mixed_people/search",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Api-Key": APOLLO_API_KEY,
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Apollo People Search failed: {e}")

    people = data.get("people", [])
    if not people:
        return None

    person = people[0]
    return {
        "apollo_person_id": person.get("id"),
        "name":             f"{person.get('first_name', '')} {person.get('last_name', '')}".strip(),
        "title":            person.get("title"),
        "linkedin_url":     person.get("linkedin_url"),
        "seniority":        person.get("seniority"),
    }


def get_credit_balance() -> int | None:
    """
    Check Apollo API credit balance.
    Returns remaining credits or None if check fails.
    """
    if not APOLLO_API_KEY:
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/auth/health",
            params={"api_key": APOLLO_API_KEY},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        # Apollo returns credits in different fields depending on plan
        credits = (
            data.get("credits_used_this_month") and
            data.get("monthly_credits_limit", 0) - data.get("credits_used_this_month", 0)
        )
        return int(credits) if credits is not None else None
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
            headers={
                "Content-Type": "application/json",
                "X-Api-Key": APOLLO_API_KEY,
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        person = data.get("person", {})
        email = person.get("email")

        # Update credits in settings
        new_balance = get_credit_balance()
        if new_balance is not None:
            db.set_setting("apollo_credits_remaining", str(new_balance))
            if new_balance < APOLLO_CREDIT_ALERT:
                db.set_setting("apollo_credits_low_alert", "true")

        return email
    except Exception as e:
        raise RuntimeError(f"Apollo email reveal failed: {e}")
