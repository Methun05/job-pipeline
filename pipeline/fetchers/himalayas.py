"""
Himalayas public API — remote jobs, all categories.
Free, no auth required. Max 20 per page; paginates up to 10 pages (200 jobs).
Role filter runs in main.py (DESIGN_ROLE_KEYWORDS).
Docs: https://himalayas.app/api
"""
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

API_URL   = "https://himalayas.app/jobs/api"
PAGE_SIZE = 20   # API hard cap
MAX_PAGES = 10   # 200 jobs max


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return BeautifulSoup(text, "lxml").get_text(separator=" ", strip=True)


def _unix_to_iso(ts) -> str | None:
    """Convert Unix timestamp (int or float) to ISO 8601 string."""
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


def fetch() -> list[dict]:
    results = []

    for page in range(MAX_PAGES):
        offset = page * PAGE_SIZE
        try:
            resp = requests.get(
                API_URL,
                params={"limit": PAGE_SIZE, "offset": offset},
                timeout=HTTP_TIMEOUT,
                headers={"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            if page == 0:
                raise RuntimeError(f"Himalayas fetch failed: {e}")
            break

        jobs = data.get("jobs", [])
        if not jobs:
            break

        for job in jobs:
            try:
                title   = (job.get("title") or "").strip()
                company = (job.get("companyName") or "").strip()
                url     = (job.get("applicationLink") or job.get("guid") or "").strip()
                if not title or not url:
                    continue

                description = _strip_html(job.get("description") or job.get("excerpt") or "")

                location = job.get("locationRestrictions") or ""
                if isinstance(location, list):
                    location = ", ".join(location)
                location = location.strip()

                posted_at = _unix_to_iso(job.get("pubDate"))

                sal_min = job.get("minSalary") or None
                sal_max = job.get("maxSalary") or None

                results.append({
                    "job_title":       title,
                    "company_name":    company,
                    "company_website": "",
                    "job_url":         url,
                    "description_raw": description,
                    "salary_min":      sal_min,
                    "salary_max":      sal_max,
                    "salary_currency": job.get("currency") or "USD",
                    "location":        location,
                    "posted_at":       posted_at,
                    "source":          "himalayas",
                    "raw_data":        {"guid": job.get("guid"), "slug": job.get("companySlug")},
                })
            except Exception:
                continue

        if len(jobs) < PAGE_SIZE:
            break

    return results
