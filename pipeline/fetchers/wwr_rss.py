"""
We Work Remotely — Design jobs RSS feed.
Feed: https://weworkremotely.com/categories/remote-design-jobs.rss
"""
import feedparser
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

RSS_URL = "https://weworkremotely.com/categories/remote-design-jobs.rss"


def fetch() -> list[dict]:
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)

    try:
        feed = feedparser.parse(RSS_URL)
    except Exception as e:
        raise RuntimeError(f"WWR RSS fetch failed: {e}")

    for entry in feed.entries:
        try:
            published = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)

            if not published or published < cutoff:
                continue

            # WWR title format: "Company: Job Title"
            title_parts = entry.get("title", "").split(":", 1)
            company = title_parts[0].strip() if len(title_parts) > 1 else ""
            job_title = title_parts[1].strip() if len(title_parts) > 1 else entry.get("title", "")

            # Region from title (e.g. "Anywhere", "USA Only")
            region = entry.get("region", "") or ""

            results.append({
                "job_title":       job_title,
                "company_name":    company,
                "company_website": "",
                "job_url":         entry.get("link", ""),
                "description_raw": entry.get("summary", ""),
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        region,
                "posted_at":       published.isoformat(),
                "source":          "wwr",
                "raw_data":        {"title": entry.get("title"), "region": region},
            })
        except Exception:
            continue

    return results
