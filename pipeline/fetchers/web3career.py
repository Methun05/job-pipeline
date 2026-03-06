"""
Web3.career API — crypto/web3 jobs.
API: https://web3.career/api/v1?token=TOKEN
Note: apply_url must be used as-is (no extra params) per API terms.
"""
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import WEB3CAREER_API_KEY, HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

API_URL = "https://web3.career/api/v1"


def fetch() -> list[dict]:
    if not WEB3CAREER_API_KEY:
        return []

    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)

    try:
        resp = requests.get(
            API_URL,
            params={
                "token":            WEB3CAREER_API_KEY,
                "remote":           "true",
                "limit":            100,
                "show_description": "true",
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Web3.career fetch failed: {e}")

    # API returns a flat array of job dicts
    jobs = data if isinstance(data, list) else []

    for item in jobs:
        try:
            if not isinstance(item, dict):
                continue

            # Date check
            date_epoch = item.get("date_epoch")
            if date_epoch:
                posted = datetime.fromtimestamp(int(date_epoch), tz=timezone.utc)
            else:
                date_str = item.get("date", "")
                if not date_str:
                    continue
                try:
                    posted = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except ValueError:
                    # Handle format like "Thu, 5 Mar 2026"
                    from email.utils import parsedate_to_datetime
                    try:
                        posted = parsedate_to_datetime(date_str)
                    except Exception:
                        continue
                if posted.tzinfo is None:
                    posted = posted.replace(tzinfo=timezone.utc)

            if posted < cutoff:
                continue

            results.append({
                "job_title":       item.get("title", ""),
                "company_name":    item.get("company", ""),
                "company_website": "",
                "job_url":         item.get("apply_url", ""),
                "description_raw": item.get("description", ""),
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        item.get("location") or item.get("country", ""),
                "posted_at":       posted.isoformat(),
                "source":          "web3career",
                "raw_data":        {
                    "id":   item.get("id"),
                    "tags": item.get("tags", []),
                },
            })
        except Exception:
            continue

    return results
