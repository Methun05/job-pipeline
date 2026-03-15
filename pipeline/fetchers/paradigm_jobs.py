"""
Paradigm job board scraper — paradigm.xyz/jobs
Paradigm is a top crypto VC — their board aggregates jobs from portfolio companies
(Fireblocks, Uniswap, OpenSea, Coinbase, etc.).

Jobs are SSR'd into __NEXT_DATA__ at props.pageProps.jobs — no auth needed.
All 600+ jobs load in a single request (no pagination).
Salary data is structured (minValue/maxValue in cents) and consistently present.
"""
import json
import requests
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

BASE_URL = "https://www.paradigm.xyz/jobs"


def fetch() -> list[dict]:
    try:
        resp = requests.get(BASE_URL, timeout=HTTP_TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"
        })
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"Paradigm jobs fetch failed: {e}")

    soup = BeautifulSoup(resp.text, "html.parser")
    tag  = soup.find("script", id="__NEXT_DATA__")
    if not tag:
        raise RuntimeError("Paradigm jobs: __NEXT_DATA__ script tag not found")

    try:
        data     = json.loads(tag.string)
        jobs_raw = data["props"]["pageProps"]["jobs"]
    except (KeyError, TypeError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Paradigm jobs: could not parse __NEXT_DATA__: {e}")

    cutoff  = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)
    results = []
    for item in jobs_raw:
        try:
            title = item.get("title") or ""
            if not title:
                continue

            # createdAt is an ISO string: "2026-03-13T17:01:24Z"
            raw_ts    = item.get("createdAt") or ""
            posted_dt = None
            if raw_ts:
                try:
                    posted_dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                except ValueError:
                    pass

            if posted_dt and posted_dt < cutoff:
                continue

            posted_at = posted_dt.isoformat() if posted_dt else None

            company_name    = item.get("companyName") or ""
            company_website = item.get("companyDomain") or ""
            if company_website and not company_website.startswith("http"):
                company_website = "https://" + company_website

            job_url = item.get("url") or BASE_URL

            # locations: array of strings; supplement with remote flag
            locations = item.get("locations") or []
            if isinstance(locations, list):
                location = ", ".join(locations)
            else:
                location = str(locations)
            if not location and item.get("remote"):
                location = "Remote"

            # Salary: structured object
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
                "description_raw": "",  # not in list payload; job page fetch handles it
                "salary_min":      salary_min,
                "salary_max":      salary_max,
                "salary_currency": (sal.get("currency") or "USD") if isinstance(sal, dict) else "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "paradigm",
                "raw_data":        {
                    "functions":   item.get("functions"),
                    "seniorities": item.get("seniorities"),
                    "remote":      item.get("remote"),
                },
            })
        except Exception:
            continue

    return results
