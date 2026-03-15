"""
Solana job board scraper — jobs.solana.com/jobs
Powered by Getro (same platform as Dragonfly / Arbitrum). Jobs are SSR'd
into __NEXT_DATA__ — no auth needed.

Differences vs Dragonfly/Arbitrum:
- `url` field is a direct full URL (no need to build from slug)
- organization object has no websiteUrl — enrichment pipeline handles that
- salary available as compensationAmountMinCents / MaxCents (divide by 100)
- location lives in `locations` list (not `locationNames`)
- descriptions are not embedded in the list view (hasDescription is just a flag)
"""
import json
import requests
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

BASE_URL = "https://jobs.solana.com/jobs"


def fetch() -> list[dict]:
    try:
        resp = requests.get(BASE_URL, timeout=HTTP_TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"
        })
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"Solana jobs fetch failed: {e}")

    soup = BeautifulSoup(resp.text, "html.parser")
    tag  = soup.find("script", id="__NEXT_DATA__")
    if not tag:
        raise RuntimeError("Solana jobs: __NEXT_DATA__ script tag not found")

    try:
        data     = json.loads(tag.string)
        jobs_raw = data["props"]["pageProps"]["initialState"]["jobs"]["found"]
    except (KeyError, TypeError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Solana jobs: could not parse __NEXT_DATA__: {e}")

    cutoff  = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)
    results = []
    for item in jobs_raw:
        try:
            title = item.get("title") or ""
            if not title:
                continue

            # Direct full URL provided by Getro
            job_url = item.get("url") or ""
            if not job_url:
                slug    = item.get("slug") or item.get("id", "")
                job_url = f"{BASE_URL}/{slug}" if slug else BASE_URL

            company      = item.get("organization") or {}
            company_name = company.get("name", "") if isinstance(company, dict) else ""
            # No websiteUrl on this Getro board — enrichment pipeline will find it
            company_website = ""

            # createdAt is a Unix timestamp int
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

            # Locations — array of strings on this board
            location = item.get("locations") or item.get("locationNames") or ""
            if isinstance(location, list):
                location = ", ".join(location)
            # Supplement with workMode if remote and location is empty/generic
            work_mode = item.get("workMode") or ""
            if work_mode == "remote" and not location:
                location = "Remote"

            # Salary — stored as cents, convert to whole dollars
            salary_min = salary_max = None
            min_cents = item.get("compensationAmountMinCents")
            max_cents = item.get("compensationAmountMaxCents")
            if isinstance(min_cents, (int, float)) and min_cents > 0:
                salary_min = int(min_cents / 100)
            if isinstance(max_cents, (int, float)) and max_cents > 0:
                salary_max = int(max_cents / 100)

            # Descriptions are not in the list payload (hasDescription is a flag)
            description = item.get("description") or item.get("descriptionBody") or ""

            results.append({
                "job_title":       title,
                "company_name":    company_name,
                "company_website": company_website,
                "job_url":         job_url,
                "description_raw": description,
                "salary_min":      salary_min,
                "salary_max":      salary_max,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "solana_jobs",
                "raw_data":        {
                    "id":       item.get("id"),
                    "slug":     item.get("slug"),
                    "seniority": item.get("seniority"),
                    "work_mode": work_mode,
                },
            })
        except Exception:
            continue

    return results
