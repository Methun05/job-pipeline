"""
Himalayas public API — remote design jobs.
Free, no auth required. Paginates up to 3 pages (150 jobs max).
Docs: https://himalayas.app/api
"""
import requests
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

API_URL    = "https://himalayas.app/jobs/api"
PAGE_SIZE  = 50
MAX_PAGES  = 3


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return BeautifulSoup(text, "lxml").get_text(separator=" ", strip=True)


def fetch() -> list[dict]:
    results = []

    for page in range(MAX_PAGES):
        offset = page * PAGE_SIZE
        try:
            resp = requests.get(
                API_URL,
                params={
                    "limit":  PAGE_SIZE,
                    "offset": offset,
                },
                timeout=HTTP_TIMEOUT,
                headers={"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            if page == 0:
                raise RuntimeError(f"Himalayas fetch failed: {e}")
            break  # partial success is fine

        jobs = data.get("jobs", [])
        if not jobs:
            break

        for job in jobs:
            try:
                title   = (job.get("title") or "").strip()
                company = (job.get("companyName") or "").strip()
                url     = (job.get("applicationLink") or job.get("url") or "").strip()
                if not title or not url:
                    continue

                description = _strip_html(job.get("description", ""))
                location    = (job.get("locationRestrictions") or "")
                if isinstance(location, list):
                    location = ", ".join(location)
                location = location.strip()

                posted_at = job.get("pubDate") or job.get("createdAt") or None
                website   = (job.get("companyWebsite") or "").strip()

                # Salary
                sal_min = job.get("salaryMin") or None
                sal_max = job.get("salaryMax") or None
                if isinstance(sal_min, str) and sal_min.isdigit():
                    sal_min = int(sal_min)
                if isinstance(sal_max, str) and sal_max.isdigit():
                    sal_max = int(sal_max)

                results.append({
                    "job_title":       title,
                    "company_name":    company,
                    "company_website": website,
                    "job_url":         url,
                    "description_raw": description,
                    "salary_min":      sal_min,
                    "salary_max":      sal_max,
                    "salary_currency": job.get("salaryCurrency") or "USD",
                    "location":        location,
                    "posted_at":       posted_at,
                    "source":          "himalayas",
                    "raw_data":        {"id": job.get("id"), "slug": job.get("slug")},
                })
            except Exception:
                continue

        # If fewer results than page size, no more pages
        if len(jobs) < PAGE_SIZE:
            break

    return results
