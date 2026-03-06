"""
MyCareersFuture.gov.sg — Singapore official jobs API. Free, no auth.
API: https://api.mycareersfuture.gov.sg/v2/jobs
"""
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

BASE_URL = "https://api.mycareersfuture.gov.sg/v2"
SEARCH_KEYWORDS = ["product designer", "ux designer", "ui designer"]


def fetch() -> list[dict]:
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)
    seen_urls = set()

    for keyword in SEARCH_KEYWORDS:
        try:
            resp = requests.get(
                f"{BASE_URL}/jobs",
                params={
                    "search":   keyword,
                    "limit":    40,
                    "page":     0,
                    "sortBy":   "new_posting_date",
                },
                headers={"User-Agent": "job-pipeline/1.0"},
                timeout=HTTP_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            # Don't fail all keywords if one fails
            continue

        for item in data.get("results", []):
            try:
                url = item.get("metadata", {}).get("jobDetailsUrl", "")
                if not url or url in seen_urls:
                    continue

                date_str = item.get("metadata", {}).get("newPostingDate", "")
                if not date_str:
                    continue
                posted = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                if posted.tzinfo is None:
                    posted = posted.replace(tzinfo=timezone.utc)
                if posted < cutoff:
                    continue

                seen_urls.add(url)
                salary = item.get("salary", {})

                results.append({
                    "job_title":       item.get("title", ""),
                    "company_name":    item.get("postedCompany", {}).get("name", ""),
                    "company_website": "",
                    "job_url":         url,
                    "description_raw": item.get("description", ""),
                    "salary_min":      float(salary.get("minimum", 0)) or None,
                    "salary_max":      float(salary.get("maximum", 0)) or None,
                    "salary_currency": "SGD",
                    "location":        "Singapore",
                    "posted_at":       posted.isoformat(),
                    "source":          "mycareers_sg",
                    "raw_data":        item,
                })
            except Exception:
                continue

    return results
