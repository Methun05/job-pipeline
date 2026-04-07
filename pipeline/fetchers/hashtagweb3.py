"""
Hashtag Web3 job board scraper — hashtagweb3.com
Uses the public REST API at /api/jobs — returns ~1100+ jobs as a JSON array.
No auth required. Fields: id, title, company, link, date, source.
Filtered to TRACK_B_HOURS_WINDOW. Design role filtering happens in main.py.
"""
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

API_URL = "https://hashtagweb3.com/api/jobs"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, */*",
}


def fetch() -> list[dict]:
    try:
        resp = requests.get(API_URL, headers=HEADERS, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        jobs_raw = resp.json()
    except Exception as e:
        raise RuntimeError(f"hashtagweb3 fetch failed: {e}")

    if not isinstance(jobs_raw, list):
        raise RuntimeError(f"hashtagweb3: unexpected response type {type(jobs_raw)}")

    cutoff  = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)
    results = []

    for item in jobs_raw:
        try:
            title   = (item.get("title") or "").strip()
            job_url = (item.get("link") or "").strip()
            company = (item.get("company") or "").strip()
            date_str = item.get("date") or None

            if not title or not job_url:
                continue

            # Parse and apply time window
            posted_at = None
            if date_str:
                try:
                    posted_dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    if posted_dt.tzinfo is None:
                        posted_dt = posted_dt.replace(tzinfo=timezone.utc)
                    if posted_dt < cutoff:
                        continue
                    posted_at = posted_dt.isoformat()
                except ValueError:
                    pass  # can't parse — let it through

            results.append({
                "job_title":       title,
                "company_name":    company,
                "company_website": "",
                "job_url":         job_url,
                "description_raw": "",
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        "",
                "posted_at":       posted_at,
                "source":          "hashtagweb3",
                "raw_data":        {"source_board": item.get("source", "")},
            })
        except Exception:
            continue

    return results
