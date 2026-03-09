"""
TalentWeb3 job board scraper — talentweb3.careers-page.com
HTML scraping using job-card div structure. ~16 listings per page.
"""
import requests
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

BASE_URL = "https://talentweb3.careers-page.com"


def fetch() -> list[dict]:
    try:
        resp = requests.get(BASE_URL + "/", timeout=HTTP_TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"
        })
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"talentweb3 fetch failed: {e}")

    soup = BeautifulSoup(resp.text, "html.parser")
    cards = soup.find_all("div", class_="job-card")

    if not cards:
        # Fallback: find all job links directly
        cards = [a.find_parent() for a in soup.find_all("a", class_="job-title-link") if a.find_parent()]

    results = []
    for card in cards:
        try:
            # Title + URL from the job-title-link anchor
            link = card.find("a", class_="job-title-link")
            if not link:
                continue
            title   = link.get_text(strip=True)
            href    = link.get("href", "")
            job_url = (BASE_URL + href) if href.startswith("/") else href
            if not title or not job_url:
                continue

            # Location from first <li> in the card
            li_items = card.find_all("li")
            location = li_items[0].get_text(strip=True) if li_items else ""

            # Description snippet from jobs-description-container
            desc_el  = card.find(class_="jobs-description-container")
            description = desc_el.get_text(separator="\n", strip=True) if desc_el else ""

            results.append({
                "job_title":       title,
                "company_name":    "TalentWeb3",  # recruiter/aggregator, no per-job company
                "company_website": BASE_URL,
                "job_url":         job_url,
                "description_raw": description,
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       None,
                "source":          "talentweb3",
                "raw_data":        None,
            })
        except Exception:
            continue

    return results
