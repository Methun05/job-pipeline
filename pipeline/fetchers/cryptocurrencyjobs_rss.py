"""
Cryptocurrency Jobs RSS feed — crypto/web3 jobs.
Feed: https://cryptocurrencyjobs.co/index.xml

Fields available: title, company (dc:creator), link, pubDate, description, tags
"""
import feedparser
import html
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from pipeline.config import TRACK_B_HOURS_WINDOW, HTTP_TIMEOUT

RSS_URL = "https://cryptocurrencyjobs.co/index.xml"


def _strip_html(html: str) -> str:
    if not html:
        return ""
    return BeautifulSoup(html, "lxml").get_text(separator=" ", strip=True)


def fetch() -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)

    try:
        feed = feedparser.parse(
            RSS_URL,
            request_headers={"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"},
        )
    except Exception as e:
        raise RuntimeError(f"CryptocurrencyJobs RSS fetch failed: {e}")

    if feed.bozo and not feed.entries:
        raise RuntimeError(f"CryptocurrencyJobs RSS parse error: {feed.bozo_exception}")

    results = []
    for entry in feed.entries:
        try:
            # Date check
            published = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            if not published or published < cutoff:
                continue

            raw_title = html.unescape(entry.get("title", "").strip())
            link      = entry.get("link", "").strip()

            # Feed title format is "Job Title at Company" — split on " at "
            if " at " in raw_title:
                parts   = raw_title.rsplit(" at ", 1)
                title   = parts[0].strip()
                company = parts[1].strip()
            else:
                title   = raw_title
                company = entry.get("author", "") or entry.get("dc_creator", "")

            # Location from tags
            location = ""
            if hasattr(entry, "tags"):
                location = ", ".join(
                    t.term for t in entry.tags
                    if t.term and t.term.lower() not in ("engineering", "design", "marketing",
                       "operations", "finance", "product", "sales", "legal", "data", "remote")
                )

            description = _strip_html(entry.get("summary", ""))

            if not title or not link:
                continue

            results.append({
                "job_title":       title,
                "company_name":    company.strip(),
                "company_website": "",
                "job_url":         link,
                "description_raw": description,
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        location.strip(),
                "posted_at":       published.isoformat(),
                "source":          "cryptocurrencyjobs",
                "raw_data":        {"guid": entry.get("id", "")},
            })
        except Exception:
            continue

    return results
