"""
CryptoJobsList RSS feed — crypto/web3 jobs.
Feed: https://api.cryptojobslist.com/jobs.rss

Notes:
- Feed returns ~15 most recent jobs across all categories (no category filter available)
- No per-item pubDate — skip time-window filter, rely on URL dedup in pipeline
- HTML in description stripped via BeautifulSoup
"""
import feedparser
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT


RSS_URL = "https://api.cryptojobslist.com/jobs.rss"


def _strip_html(html: str) -> str:
    """Strip HTML tags, return plain text."""
    if not html:
        return ""
    return BeautifulSoup(html, "lxml").get_text(separator=" ", strip=True)


def fetch() -> list[dict]:
    """
    Returns list of normalized job dicts.
    Design role keyword filtering happens in main.py (is_design_role).
    No date filter — URL dedup handles deduplication across runs.
    """
    try:
        feed = feedparser.parse(
            RSS_URL,
            request_headers={
                "User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)",
            },
        )
    except Exception as e:
        raise RuntimeError(f"CryptoJobsList RSS fetch failed: {e}")

    if feed.bozo and not feed.entries:
        raise RuntimeError(f"CryptoJobsList RSS parse error: {feed.bozo_exception}")

    results = []
    for entry in feed.entries:
        try:
            title   = entry.get("title", "").strip()
            link    = entry.get("link", "").strip()
            company = entry.get("author", "") or entry.get("dc_creator", "")

            # Location lives in media_location or tags
            location = ""
            if hasattr(entry, "media_location"):
                location = entry.media_location
            elif hasattr(entry, "tags"):
                # tags list — pick non-category ones as location hints
                location = " ".join(
                    t.term for t in entry.tags
                    if t.term and not t.term.startswith("#")
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
                "posted_at":       None,   # feed has no per-item date
                "source":          "cryptojobslist",
                "raw_data":        {"guid": entry.get("id", "")},
            })
        except Exception:
            continue

    return results
