"""
Hashtag Web3 job board scraper — hashtagweb3.com
Jobs are embedded as JSON-LD (JobPosting schema) in <script type="application/ld+json"> tags.
260+ listings, fetched in a single page request — filtered to TRACK_B_HOURS_WINDOW.
"""
import json
import requests
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

BASE_URL = "https://hashtagweb3.com/"


def fetch() -> list[dict]:
    try:
        resp = requests.get(BASE_URL, timeout=HTTP_TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"
        })
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"hashtagweb3 fetch failed: {e}")

    soup = BeautifulSoup(resp.text, "html.parser")
    ld_tags = soup.find_all("script", type="application/ld+json")

    jobs_raw = []
    for tag in ld_tags:
        try:
            data = json.loads(tag.string or "")
            if isinstance(data, list):
                jobs_raw.extend(x for x in data if isinstance(x, dict) and x.get("@type") == "JobPosting")
            elif isinstance(data, dict) and data.get("@type") == "JobPosting":
                jobs_raw.append(data)
        except (json.JSONDecodeError, TypeError):
            continue

    if not jobs_raw:
        raise RuntimeError("hashtagweb3: no JobPosting JSON-LD entries found")

    cutoff  = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)
    results = []
    for item in jobs_raw:
        try:
            title = item.get("title", "")
            if not title:
                continue

            job_url = item.get("url", "")
            if not job_url:
                continue

            org     = item.get("hiringOrganization") or {}
            company_name = org.get("name", "") if isinstance(org, dict) else ""

            posted_at = item.get("datePosted") or None

            # Skip jobs older than the time window
            if posted_at:
                try:
                    posted_dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
                    if posted_dt.tzinfo is None:
                        posted_dt = posted_dt.replace(tzinfo=timezone.utc)
                    if posted_dt < cutoff:
                        continue
                except ValueError:
                    pass  # can't parse date — let it through

            loc_obj   = item.get("jobLocation") or {}
            addr      = loc_obj.get("address") or {} if isinstance(loc_obj, dict) else {}
            location  = addr.get("addressLocality", "") if isinstance(addr, dict) else ""

            description = item.get("description", "")

            results.append({
                "job_title":       title,
                "company_name":    company_name,
                "company_website": "",
                "job_url":         job_url,
                "description_raw": description,
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "hashtagweb3",
                "raw_data":        None,
            })
        except Exception:
            continue

    return results
