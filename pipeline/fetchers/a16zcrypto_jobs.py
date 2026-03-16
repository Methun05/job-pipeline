"""
a16z Crypto portfolio job board scraper — a16zcrypto.com/jobs/
Scrapes the portfolioJobs JS variable embedded in the page HTML.
660+ jobs across ~59 crypto portfolio companies (EigenLayer, Uniswap, Arbitrum, etc.)
Data structure mirrors paradigm_jobs.py: same field names, same salary format.
"""
import re
import json
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

BASE_URL = "https://a16zcrypto.com/jobs/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"}


def fetch() -> list[dict]:
    try:
        resp = requests.get(BASE_URL, headers=HEADERS, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"a16zcrypto jobs fetch failed: {e}")

    m = re.search(r'portfolioJobs\s*=\s*(\[.*?\]);', resp.text, re.DOTALL)
    if not m:
        raise RuntimeError("a16zcrypto jobs: portfolioJobs variable not found in page")

    try:
        raw = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"a16zcrypto jobs: failed to parse portfolioJobs JSON: {e}")

    # a16zcrypto board updates weekly — use 30-day window instead of 72h.
    # URL dedup in process_job_posting prevents re-insertion on subsequent runs.
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    results = []

    # Structure: [{company, jobs: [{...job fields...}]}]
    for company_group in raw:
        for item in company_group.get("jobs", []):
            try:
                title = item.get("title") or ""
                if not title:
                    continue

                raw_ts = item.get("createdAt") or ""
                posted_dt = None
                if raw_ts:
                    try:
                        posted_dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                    except ValueError:
                        pass

                if posted_dt and posted_dt < cutoff:
                    continue

                company_name = item.get("companyName") or company_group.get("company") or ""
                company_website = item.get("companyDomain") or ""
                if company_website and not company_website.startswith("http"):
                    company_website = "https://" + company_website

                job_url = item.get("url") or BASE_URL

                locations = item.get("locations") or []
                location = ", ".join(locations) if isinstance(locations, list) else str(locations)
                if not location and item.get("remote"):
                    location = "Remote"

                salary_min = salary_max = None
                sal = item.get("salary") or {}
                if isinstance(sal, dict):
                    if isinstance(sal.get("minValue"), (int, float)):
                        salary_min = int(sal["minValue"])
                    if isinstance(sal.get("maxValue"), (int, float)):
                        salary_max = int(sal["maxValue"])

                results.append({
                    "job_title":       title,
                    "company_name":    company_name,
                    "company_website": company_website,
                    "job_url":         job_url,
                    "description_raw": "",
                    "salary_min":      salary_min,
                    "salary_max":      salary_max,
                    "salary_currency": (sal.get("currency") or "USD") if isinstance(sal, dict) else "USD",
                    "location":        location,
                    "posted_at":       posted_dt.isoformat() if posted_dt else None,
                    "source":          "a16zcrypto",
                    "raw_data": {
                        "functions":   item.get("functions"),
                        "seniorities": item.get("seniorities"),
                        "remote":      item.get("remote"),
                    },
                })
            except Exception:
                continue

    return results
