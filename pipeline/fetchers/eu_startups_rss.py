"""
EU-Startups RSS — European funded startups.
Feed: https://www.eu-startups.com/feed/
Same pattern as TechCrunch: articles → Groq extraction.
"""
import feedparser
from datetime import datetime, timezone, timedelta
from pipeline.config import TRACK_A_DAYS_WINDOW

RSS_URL = "https://www.eu-startups.com/feed/"

FUNDING_SIGNAL_WORDS = [
    "raises", "raised", "funding", "million", "seed", "series a", "series b",
    "pre-seed", "investment", "backed", "round", "€", "euros",
]


def fetch() -> list[dict]:
    """
    Returns list of raw article dicts for generator's Groq extraction.
    """
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRACK_A_DAYS_WINDOW)

    try:
        feed = feedparser.parse(RSS_URL)
    except Exception as e:
        raise RuntimeError(f"EU-Startups RSS fetch failed: {e}")

    for entry in feed.entries:
        try:
            published = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                published = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

            if not published or published < cutoff:
                continue

            text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
            if not any(word in text for word in FUNDING_SIGNAL_WORDS):
                continue

            results.append({
                "title":          entry.get("title", ""),
                "summary":        entry.get("summary", ""),
                "link":           entry.get("link", ""),
                "published_date": published.date().isoformat(),
                "source":         "eu_startups",
            })
        except Exception:
            continue

    return results
