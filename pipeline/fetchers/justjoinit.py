"""
JustJoinIT — Poland/CEE tech jobs. Free public API.
API: https://justjoin.it/api/offers
"""
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

API_URL = "https://justjoin.it/api/offers"


def fetch() -> list[dict]:
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)

    try:
        resp = requests.get(
            API_URL,
            headers={"User-Agent": "job-pipeline/1.0"},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        jobs = resp.json()
    except Exception as e:
        raise RuntimeError(f"JustJoinIT fetch failed: {e}")

    for item in jobs:
        try:
            # Only design-adjacent categories
            category = (item.get("marker_icon") or "").lower()
            if category not in ("ux", "design", "product"):
                continue

            date_str = item.get("published_at", "")
            if not date_str:
                continue
            posted = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if posted.tzinfo is None:
                posted = posted.replace(tzinfo=timezone.utc)
            if posted < cutoff:
                continue

            # Salary
            salary_min, salary_max, currency = None, None, "PLN"
            for emp in item.get("employment_types", []):
                sal = emp.get("salary")
                if sal:
                    salary_min = sal.get("from")
                    salary_max = sal.get("to")
                    currency   = sal.get("currency", "PLN").upper()
                    break

            results.append({
                "job_title":       item.get("title", ""),
                "company_name":    item.get("company_name", ""),
                "company_website": item.get("company_url", ""),
                "job_url":         f"https://justjoin.it/offers/{item.get('id', '')}",
                "description_raw": item.get("body", ""),
                "salary_min":      float(salary_min) if salary_min else None,
                "salary_max":      float(salary_max) if salary_max else None,
                "salary_currency": currency,
                "location":        item.get("city", "") + " " + item.get("country_code", ""),
                "posted_at":       posted.isoformat(),
                "source":          "justjoinit",
                "raw_data":        item,
            })
        except Exception:
            continue

    return results
