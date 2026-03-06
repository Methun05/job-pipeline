"""
TechCrunch RSS — extracts funded company info from articles via Groq.
Feed: https://techcrunch.com/feed/
"""
import feedparser
from datetime import datetime, timezone, timedelta
from pipeline.config import TRACK_A_DAYS_WINDOW, HTTP_TIMEOUT

RSS_URL = "https://techcrunch.com/feed/"

# Keywords that suggest a funding article — pre-screen before paying Groq tokens
FUNDING_SIGNAL_WORDS = [
    "raises", "raised", "funding", "million", "seed", "series a", "series b",
    "pre-seed", "investment", "backed", "round",
]


def fetch() -> list[dict]:
    """
    Returns list of raw article dicts for the generator to process via Groq.
    Each dict: {title, summary, link, published_date, source}
    Generator will extract structured funding info and filter by confidence.
    """
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRACK_A_DAYS_WINDOW)

    try:
        feed = feedparser.parse(RSS_URL)
    except Exception as e:
        raise RuntimeError(f"TechCrunch RSS fetch failed: {e}")

    for entry in feed.entries:
        try:
            # Date check
            published = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                published = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

            if not published or published < cutoff:
                continue

            # Pre-screen: must contain funding signal words
            text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
            if not any(word in text for word in FUNDING_SIGNAL_WORDS):
                continue

            results.append({
                "title":          entry.get("title", ""),
                "summary":        entry.get("summary", ""),
                "link":           entry.get("link", ""),
                "published_date": published.date().isoformat(),
                "source":         "techcrunch",
            })
        except Exception:
            continue

    return results
