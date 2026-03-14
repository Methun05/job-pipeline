"""
Jobicy public API — remote design jobs.
Free, no auth required. Max 50 per request, tag-filtered.
API docs: https://jobicy.com/jobs-rss-feed
"""
import requests
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

API_URL = "https://jobicy.com/api/v2/remote-jobs"


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return BeautifulSoup(text, "lxml").get_text(separator=" ", strip=True)


def fetch() -> list[dict]:
    try:
        resp = requests.get(
            API_URL,
            params={"count": 50, "tag": "design"},
            timeout=HTTP_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Jobicy fetch failed: {e}")

    jobs = data.get("jobs", [])
    results = []
    for job in jobs:
        try:
            title   = (job.get("jobTitle") or "").strip()
            company = (job.get("companyName") or "").strip()
            url     = (job.get("url") or "").strip()
            if not title or not url:
                continue

            description = _strip_html(job.get("jobDescription") or job.get("jobExcerpt") or "")
            location    = (job.get("jobGeo") or "").strip()
            posted_at   = job.get("pubDate") or None

            results.append({
                "job_title":       title,
                "company_name":    company,
                "company_website": "",
                "job_url":         url,
                "description_raw": description,
                "salary_min":      job.get("annualSalaryMin") or None,
                "salary_max":      job.get("annualSalaryMax") or None,
                "salary_currency": job.get("salaryCurrency") or "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "jobicy",
                "raw_data":        {"id": job.get("id"), "slug": job.get("jobSlug")},
            })
        except Exception:
            continue

    return results
