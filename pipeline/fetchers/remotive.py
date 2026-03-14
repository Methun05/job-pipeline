"""
Remotive public API — remote design jobs.
API docs: https://remotive.com/api/remote-jobs
Free, no auth required.
Attribution: jobs originally posted on Remotive (shown via source label in dashboard).
"""
import requests
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

API_URL = "https://remotive.com/api/remote-jobs"


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return BeautifulSoup(text, "lxml").get_text(separator=" ", strip=True)


def _parse_salary(job: dict) -> tuple[int | None, int | None]:
    """Extract salary_min/max from Remotive salary string like '$80k - $120k'."""
    import re
    sal = job.get("salary", "") or ""
    m = re.search(r"\$(\d+(?:\.\d+)?)k?\s*[-–]\s*\$?(\d+(?:\.\d+)?)k", sal, re.IGNORECASE)
    if m:
        lo = float(m.group(1))
        hi = float(m.group(2))
        # If values look like thousands already (e.g. 80k), convert
        lo = int(lo * 1000) if lo < 1000 else int(lo)
        hi = int(hi * 1000) if hi < 1000 else int(hi)
        return lo, hi
    return None, None


def fetch() -> list[dict]:
    try:
        resp = requests.get(
            API_URL,
            params={"category": "Design"},
            timeout=HTTP_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"Remotive fetch failed: {e}")

    jobs = data.get("jobs", [])
    results = []
    for job in jobs:
        try:
            title   = (job.get("title") or "").strip()
            company = (job.get("company_name") or "").strip()
            url     = (job.get("url") or "").strip()
            if not title or not url:
                continue

            sal_min, sal_max = _parse_salary(job)
            description = _strip_html(job.get("description", ""))
            location    = (job.get("candidate_required_location") or "").strip()

            # published_at is ISO string like "2024-01-15T10:00:00"
            posted_at = job.get("publication_date") or job.get("published_at") or None

            results.append({
                "job_title":       title,
                "company_name":    company,
                "company_website": (job.get("company_logo") or "").replace("/logo/", "/").split("/logo")[0],
                "job_url":         url,
                "description_raw": description,
                "salary_min":      sal_min,
                "salary_max":      sal_max,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "remotive",
                "raw_data":        {"id": job.get("id"), "tags": job.get("tags", [])},
            })
        except Exception:
            continue

    return results
