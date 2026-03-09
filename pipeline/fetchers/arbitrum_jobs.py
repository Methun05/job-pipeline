"""
Arbitrum jobs board scraper — jobs.arbitrum.io/jobs
Same Getro platform as Dragonfly. Jobs SSR'd into __NEXT_DATA__, no auth needed.
Fetches top 20 newest jobs on every pipeline run.
"""
import json
import requests
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

BASE_URL = "https://jobs.arbitrum.io/jobs"


def fetch() -> list[dict]:
    try:
        resp = requests.get(BASE_URL, timeout=HTTP_TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"
        })
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"Arbitrum jobs fetch failed: {e}")

    soup = BeautifulSoup(resp.text, "html.parser")
    tag  = soup.find("script", id="__NEXT_DATA__")
    if not tag:
        raise RuntimeError("Arbitrum jobs: __NEXT_DATA__ script tag not found")

    try:
        data     = json.loads(tag.string)
        jobs_raw = data["props"]["pageProps"]["initialState"]["jobs"]["found"]
    except (KeyError, TypeError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Arbitrum jobs: could not parse __NEXT_DATA__: {e}")

    cutoff  = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)
    results = []
    for item in jobs_raw:
        try:
            title = item.get("title") or item.get("job_title", "")
            if not title:
                continue

            slug    = item.get("slug") or item.get("id", "")
            job_url = f"https://jobs.arbitrum.io/jobs/{slug}" if slug else BASE_URL

            company         = item.get("organization") or {}
            company_name    = company.get("name", "")    if isinstance(company, dict) else ""
            company_website = company.get("websiteUrl", "") if isinstance(company, dict) else ""

            # createdAt is a Unix timestamp int on Getro boards
            raw_ts    = item.get("publishedAt") or item.get("createdAt") or None
            posted_dt = None
            if isinstance(raw_ts, (int, float)):
                posted_dt = datetime.fromtimestamp(raw_ts, tz=timezone.utc)
            elif isinstance(raw_ts, str):
                try:
                    posted_dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                    if posted_dt.tzinfo is None:
                        posted_dt = posted_dt.replace(tzinfo=timezone.utc)
                except ValueError:
                    pass

            if posted_dt and posted_dt < cutoff:
                continue

            posted_at = posted_dt.isoformat() if posted_dt else None

            location = item.get("locationNames") or ""
            if isinstance(location, list):
                location = ", ".join(location)

            description = item.get("description") or item.get("descriptionBody") or ""

            results.append({
                "job_title":       title,
                "company_name":    company_name,
                "company_website": company_website,
                "job_url":         job_url,
                "description_raw": description,
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "arbitrum",
                "raw_data":        {"id": item.get("id"), "slug": slug},
            })
        except Exception:
            continue

    return results
