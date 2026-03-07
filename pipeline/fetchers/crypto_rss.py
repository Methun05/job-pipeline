"""
Crypto RSS feeds — extracts funded company info from articles via Gemini.
Replaces CryptoRank (free tier doesn't include funding rounds).

Feeds:
  - Cointelegraph: https://cointelegraph.com/rss
  - Decrypt:       https://decrypt.co/feed
  - Blockworks:    https://blockworks.co/feed
"""
import feedparser
from datetime import datetime, timezone, timedelta
from pipeline.config import TRACK_A_DAYS_WINDOW

FEEDS = [
    ("https://cointelegraph.com/rss",  "cointelegraph"),
    ("https://decrypt.co/feed",        "decrypt"),
    ("https://blockworks.co/feed",     "blockworks"),
]

FUNDING_SIGNAL_WORDS = [
    "raises", "raised", "funding", "million", "seed", "series a", "series b",
    "pre-seed", "investment", "backed", "round", "venture",
]


def fetch() -> list[dict]:
    """
    Returns list of raw article dicts for Gemini to extract funding info from.
    Each dict: {title, summary, link, published_date, source}
    """
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRACK_A_DAYS_WINDOW)

    for feed_url, source_name in FEEDS:
        try:
            feed = feedparser.parse(feed_url)
        except Exception:
            continue

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
                    "source":         source_name,
                })
            except Exception:
                continue

    return results
