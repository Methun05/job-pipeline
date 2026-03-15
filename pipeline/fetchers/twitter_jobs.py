"""
Twitter/X job lead fetcher — uses Exa neural search (no Twitter account needed).

Search strategy: 2 Exa queries × 25 results = up to 50 tweet candidates.
Gate 1 (free): drop retweets, drop job board links, drop very low-follower accounts.
Gate 2 (Gemini classify_tweet): called by the orchestrator after fetching.

Returns list of normalized lead dicts ready for Gemini classification.
"""
import re
import time
from datetime import datetime, timezone, timedelta
from pipeline.enrichment.exa_finder import _exa_search, _get_clients

# Job board domains — tweets linking to these are just reshares, not direct leads
JOB_BOARD_DOMAINS = {
    "lever.co", "greenhouse.io", "ashbyhq.com", "jobs.ashbyhq.com",
    "boards.greenhouse.io", "apply.workable.com", "web3.career",
    "cryptojobslist.com", "cryptocurrencyjobs.co", "wellfound.com",
    "linkedin.com/jobs", "indeed.com", "glassdoor.com",
}

# Accounts whose tweet URLs we don't want (job boards posting on Twitter)
JOB_BOARD_HANDLES = {
    "web3career", "cryptojobslist", "cryptocurrencyjobs", "web3jobs",
    "blockchainjobs", "defi_jobs", "nft_jobs",
}

_RETWEET_RE   = re.compile(r'^RT @', re.IGNORECASE)
_HANDLE_RE    = re.compile(r'x\.com/([A-Za-z0-9_]{1,50})/status/(\d+)', re.IGNORECASE)


def _parse_tweet_url(url: str) -> tuple[str, str] | tuple[None, None]:
    """Extract (handle, tweet_id) from a tweet URL."""
    m = _HANDLE_RE.search(url or "")
    if not m:
        return None, None
    return m.group(1), m.group(2)


def _has_job_board_link(text: str) -> bool:
    """Return True if tweet text contains a link to a known job board."""
    text_lower = (text or "").lower()
    return any(domain in text_lower for domain in JOB_BOARD_DOMAINS)


def _is_retweet(text: str) -> bool:
    return bool(_RETWEET_RE.match(text or ""))


def _extract_followers(result) -> int | None:
    """Exa result objects may have author.followers or extras — best-effort."""
    try:
        # exa-py sometimes surfaces author metadata
        author = getattr(result, "author", None)
        if author and hasattr(author, "followers"):
            return int(author.followers)
    except Exception:
        pass
    return None


def _normalize_result(result) -> dict | None:
    """
    Convert a raw Exa result to a normalized lead dict.
    Returns None if the result fails Gate 1 checks.
    """
    url  = result.url or ""
    text = (result.text or result.title or "").strip()

    handle, tweet_id = _parse_tweet_url(url)
    if not handle or not tweet_id:
        return None

    # Gate 1: drop known job-board handles
    if handle.lower() in JOB_BOARD_HANDLES:
        return None

    # Gate 1: drop retweets
    if _is_retweet(text):
        return None

    # Gate 1: drop tweets that are just resharing job board listings
    if _has_job_board_link(text):
        return None

    # Gate 1: follower count — skip if explicitly available and very low
    followers = _extract_followers(result)
    if followers is not None and followers < 200:
        return None

    # Parse posted_at
    posted_at = None
    if result.published_date:
        try:
            posted_at = datetime.fromisoformat(
                result.published_date.replace("Z", "+00:00")
            ).isoformat()
        except Exception:
            pass

    return {
        "tweet_url":       url,
        "tweet_text":      text,
        "posted_at":       posted_at,
        "poster_handle":   handle,
        "poster_name":     getattr(result, "author", None) and getattr(result.author, "name", None) or None,
        "poster_bio":      None,  # Exa doesn't return bio — Gemini infers from text
        "poster_followers": followers,
    }


# ── Exa search queries ────────────────────────────────────────────────────────

SEARCH_QUERIES = [
    'hiring "product designer" (crypto OR web3 OR defi)',
    '"looking for" designer (web3 OR crypto)',
]


def fetch(days_back: int = 7) -> list[dict]:
    """
    Run 2 Exa queries targeting Twitter/X, apply Gate 1 filters.
    Returns list of normalized lead dicts (no Gemini yet).

    days_back: how far back to search (default 7 days).
    """
    if not _get_clients():
        print("[TwitterFetcher] No Exa API keys configured — skipping")
        return []

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")

    seen_urls: set[str] = set()
    leads: list[dict]   = []

    for query in SEARCH_QUERIES:
        try:
            results = _exa_search(
                query,
                type="neural",
                num_results=25,
                category="tweet",
                start_published_date=cutoff,
            )
            print(f"[TwitterFetcher] Query '{query[:50]}...' → {len(results)} raw results")
        except Exception as e:
            print(f"[TwitterFetcher] Exa search failed: {e}")
            continue

        for r in results:
            url = r.url or ""
            if url in seen_urls:
                continue
            seen_urls.add(url)

            lead = _normalize_result(r)
            if lead:
                leads.append(lead)

        time.sleep(0.5)  # small pause between queries

    print(f"[TwitterFetcher] Gate 1 passed: {len(leads)} leads from {len(seen_urls)} raw results")
    return leads
