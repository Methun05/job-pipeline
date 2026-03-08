"""
Crunchbase News RSS — extracts funded company info from articles via Gemini.
Feed: https://news.crunchbase.com/feed/

General tech feed, so we apply two pre-screens before passing to Gemini:
  1. Funding signal words  (raises, seed, series a, etc.)
  2. Crypto/web3 keywords (crypto, blockchain, defi, web3, etc.)
"""
import feedparser
from datetime import datetime, timezone, timedelta
from pipeline.config import TRACK_A_DAYS_WINDOW

RSS_URL = "https://news.crunchbase.com/feed/"

FUNDING_SIGNAL_WORDS = [
    "raises", "raised", "funding", "million", "seed", "series a", "series b",
    "pre-seed", "investment", "backed", "round", "venture",
]

CRYPTO_KEYWORDS = [
    "crypto", "cryptocurrency", "blockchain", "defi", "decentralized",
    "web3", "web 3", "nft", "token", "bitcoin", "ethereum", "solana",
    "layer 2", "layer2", "l2", "protocol", "wallet", "exchange", "dex",
    "stablecoin", "dao", "on-chain", "onchain", "smart contract",
]


def fetch() -> list[dict]:
    """
    Returns list of raw article dicts for Gemini to extract funding info from.
    Each dict: {title, summary, link, published_date, source}
    """
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRACK_A_DAYS_WINDOW)

    try:
        feed = feedparser.parse(RSS_URL)
    except Exception as e:
        raise RuntimeError(f"Crunchbase RSS fetch failed: {e}")

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

            if not any(kw in text for kw in CRYPTO_KEYWORDS):
                continue

            results.append({
                "title":          entry.get("title", ""),
                "summary":        entry.get("summary", ""),
                "link":           entry.get("link", ""),
                "published_date": published.date().isoformat(),
                "source":         "crunchbase",
            })
        except Exception:
            continue

    return results
