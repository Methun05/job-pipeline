"""
Web3.career scraper — /design-jobs listing page.
No API key required. Scrapes the design-filtered listing directly.
"""
import re
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

BASE_URL  = "https://web3.career"
LIST_URL  = f"{BASE_URL}/design-jobs"
HEADERS   = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def _parse_age(age_str: str, now: datetime) -> datetime | None:
    """Convert relative age ('19h', '1d', '3d') to an absolute datetime."""
    age_str = age_str.strip().lower()
    m = re.match(r"^(\d+)h$", age_str)
    if m:
        return now - timedelta(hours=int(m.group(1)))
    m = re.match(r"^(\d+)d$", age_str)
    if m:
        return now - timedelta(days=int(m.group(1)))
    m = re.match(r"^(\d+)w$", age_str)
    if m:
        return now - timedelta(weeks=int(m.group(1)))
    return None


def _parse_salary(text: str) -> tuple[int | None, int | None]:
    """Parse '$77k - $112k' → (77000, 112000). Returns (None, None) if unrecognised."""
    text = text.strip()
    m = re.match(r"\$(\d+(?:\.\d+)?)k\s*[-–]\s*\$(\d+(?:\.\d+)?)k", text, re.IGNORECASE)
    if m:
        return int(float(m.group(1)) * 1000), int(float(m.group(2)) * 1000)
    return None, None


def fetch() -> list[dict]:
    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=TRACK_B_HOURS_WINDOW)

    try:
        resp = requests.get(LIST_URL, headers=HEADERS, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"Web3.career scrape failed: {e}")

    soup = BeautifulSoup(resp.text, "lxml")
    rows = soup.select("tr.table_row")

    results = []
    for row in rows:
        try:
            # Filter out ad/sponsored rows — real jobs have a numeric data-jobid
            job_id = row.get("data-jobid", "")
            if not job_id or not job_id.isdigit():
                continue

            tds = row.find_all("td")
            if len(tds) < 4:
                continue

            title    = tds[0].get_text(strip=True)
            company  = tds[1].get_text(strip=True)
            age_text = tds[2].get_text(strip=True)
            location = tds[3].get_text(strip=True).replace(",", ", ")

            if not title or not company:
                continue

            # Age → datetime (skip if unparseable or outside window)
            posted = _parse_age(age_text, now)
            if posted is None or posted < cutoff:
                continue

            # Job URL from onclick
            onclick = row.get("onclick", "")
            m = re.search(r"'(/[^']+)'", onclick)
            job_url = f"{BASE_URL}{m.group(1)}" if m else ""

            # Salary (may not be present)
            salary_el = row.select_one(".text-salary")
            salary_text = salary_el.get_text(strip=True) if salary_el else ""
            sal_min, sal_max = _parse_salary(salary_text)

            # Tags → use as description_raw for experience/remote classification
            tags_td = tds[5] if len(tds) > 5 else None
            tags_text = tags_td.get_text(separator=" ", strip=True) if tags_td else ""

            results.append({
                "job_title":       title,
                "company_name":    company,
                "company_website": "",
                "job_url":         job_url,
                "description_raw": tags_text,
                "salary_min":      sal_min,
                "salary_max":      sal_max,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       posted.isoformat(),
                "source":          "web3career",
                "raw_data":        {"id": job_id, "tags": tags_text},
            })
        except Exception:
            continue

    return results
