"""
CryptoJobsList scraper — cryptojobslist.com/design
Scrapes the design category page via __NEXT_DATA__ SSR (RSS feed is blocked/empty as of Apr 2026).
Returns active design jobs. URL dedup handles deduplication across runs.
"""
import json
import re
import requests
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

PAGE_URL = "https://cryptojobslist.com/design"
HEADERS  = {
    "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "identity",  # prevent gzip — requests handles it, but this avoids any decode issues
}


def _strip_html(raw: str) -> str:
    if not raw:
        return ""
    return BeautifulSoup(raw, "lxml").get_text(separator=" ", strip=True)


def fetch() -> list[dict]:
    """
    Returns list of normalized job dicts.
    Design role filtering happens in main.py (is_design_role).
    No date filter — URL dedup handles deduplication across runs.
    """
    try:
        resp = requests.get(PAGE_URL, headers=HEADERS, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"CryptoJobsList scrape failed: {e}")

    m = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        resp.text, re.DOTALL
    )
    if not m:
        raise RuntimeError("CryptoJobsList: __NEXT_DATA__ not found in page")

    try:
        nd   = json.loads(m.group(1))
        jobs = nd["props"]["pageProps"]["jobs"]
    except (json.JSONDecodeError, KeyError) as e:
        raise RuntimeError(f"CryptoJobsList: failed to parse __NEXT_DATA__: {e}")

    if not isinstance(jobs, list):
        raise RuntimeError(f"CryptoJobsList: unexpected jobs type {type(jobs)}")

    results = []
    for job in jobs:
        try:
            title   = (job.get("jobTitle") or "").strip()
            slug    = (job.get("seoSlug") or "").strip()
            company = (job.get("companyName") or "").strip()

            if not title or not slug:
                continue

            job_url    = f"https://cryptojobslist.com/jobs/{slug}"
            location   = (job.get("jobLocation") or "").strip()
            posted_at  = job.get("publishedAt") or None  # ISO string
            desc_raw   = _strip_html(job.get("jobDescription") or "")

            # Salary
            sal_str = job.get("salaryString") or ""
            sal_min = sal_max = None
            sal_m = re.match(r"\$?([\d,]+)[kK]?\s*[-–]\s*\$?([\d,]+)[kK]?", sal_str)
            if sal_m:
                def _parse_sal(s):
                    val = int(s.replace(",", ""))
                    return val * 1000 if val < 1000 else val
                sal_min = _parse_sal(sal_m.group(1))
                sal_max = _parse_sal(sal_m.group(2))

            results.append({
                "job_title":       title,
                "company_name":    company,
                "company_website": "",
                "job_url":         job_url,
                "description_raw": desc_raw,
                "salary_min":      sal_min,
                "salary_max":      sal_max,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "cryptojobslist",
                "raw_data":        {"id": job.get("_id") or job.get("id", "")},
            })
        except Exception:
            continue

    return results
