"""
Remotive API — free, max 4 calls/day. We call ONCE per pipeline run.
Docs: https://remotive.com/api/remote-jobs
"""
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

API_URL = "https://remotive.com/api/remote-jobs"


def fetch() -> list[dict]:
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)

    try:
        resp = requests.get(
            API_URL,
            params={"category": "Design"},  # pre-filter by category
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Remotive fetch failed: {e}")

    for item in data.get("jobs", []):
        try:
            date_str = item.get("publication_date", "")
            if not date_str:
                continue
            posted = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if posted.tzinfo is None:
                posted = posted.replace(tzinfo=timezone.utc)
            if posted < cutoff:
                continue

            results.append({
                "job_title":       item.get("title", ""),
                "company_name":    item.get("company_name", ""),
                "company_website": item.get("company_logo", ""),  # fallback
                "job_url":         item.get("url", ""),
                "description_raw": item.get("description", ""),
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        item.get("candidate_required_location", ""),
                "posted_at":       posted.isoformat(),
                "source":          "remotive",
                "raw_data":        item,
            })
        except Exception:
            continue

    return results
