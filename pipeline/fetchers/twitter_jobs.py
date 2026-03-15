"""
Twitter/X job lead fetcher — uses Exa neural search (no Twitter account needed).

Search strategy: 2 Exa queries × 25 results = up to 50 tweet candidates.
Gate 1 (free): drop retweets, drop job board links, drop known bot handles.
Gate 2 (Gemini classify_tweet): called by the orchestrator after fetching.

Returns list of normalized lead dicts ready for Gemini classification.

NOTE: Exa does not return follower counts for tweets — that gate is not used.
"""
import re
import time
from datetime import datetime, timezone, timedelta
from pipeline.enrichment.exa_finder import _exa_search, _get_clients

# Job board domains — tweets linking to these are reshares, not direct leads
JOB_BOARD_DOMAINS = {
    "lever.co", "greenhouse.io", "ashbyhq.com", "jobs.ashbyhq.com",
    "boards.greenhouse.io", "apply.workable.com", "web3.career",
    "cryptojobslist.com", "cryptocurrencyjobs.co", "wellfound.com",
    "linkedin.com/jobs", "indeed.com", "glassdoor.com",
}

# Known job board / aggregator bot handles — not founder tweets
JOB_BOARD_HANDLES = {
    "web3career", "cryptojobslist", "cryptocurrencyjobs", "web3jobs",
    "blockchainjobs", "defi_jobs", "nft_jobs", "web3hiresxyz",
    "jobmeterapp", "jobsincrypto", "definitiveweb3",
    "web3jobboard", "cryptohire", "blockchainhire",
}

_RETWEET_RE = re.compile(r'^RT @', re.IGNORECASE)
_HANDLE_RE  = re.compile(r'x\.com/([A-Za-z0-9_]{1,50})/status/(\d+)', re.IGNORECASE)


def _parse_tweet_url(url: str) -> tuple[str, str] | tuple[None, None]:
    m = _HANDLE_RE.search(url or "")
    if not m:
        return None, None
    return m.group(1), m.group(2)


def _has_job_board_link(text: str) -> bool:
    text_lower = (text or "").lower()
    return any(domain in text_lower for domain in JOB_BOARD_DOMAINS)


def _is_retweet(text: str) -> bool:
    return bool(_RETWEET_RE.match(text or ""))


def _normalize_result(result) -> dict | None:
    """
    Convert a raw Exa result to a normalized lead dict.
    Returns None if the result fails Gate 1 checks.
    """
    url  = result.url or ""
    # result.text comes from search_and_contents; fall back to title
    text = (getattr(result, "text", None) or result.title or "").strip()

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

    # Gate 1: require at least 30 chars of text so Gemini has something to classify
    if len(text) < 30:
        return None

    # Parse posted_at
    posted_at = None
    if getattr(result, "published_date", None):
        try:
            posted_at = datetime.fromisoformat(
                result.published_date.replace("Z", "+00:00")
            ).isoformat()
        except Exception:
            pass

    # result.author is a plain string (the author's display name), not an object
    poster_name = getattr(result, "author", None) or None

    return {
        "tweet_url":        url,
        "tweet_text":       text,
        "posted_at":        posted_at,
        "poster_handle":    handle,
        "poster_name":      poster_name,
        "poster_bio":       None,   # Exa doesn't return bios for tweets
        "poster_followers": None,   # Exa doesn't return follower counts for tweets
    }


# ── Exa search queries ────────────────────────────────────────────────────────
# Conversational phrasing targets founder posts, not job board templates.

SEARCH_QUERIES = [
    "we are looking for a product designer to join our crypto web3 team",
    "hiring product designer UI UX designer web3 defi blockchain startup",
]


def fetch(days_back: int = 7) -> list[dict]:
    """
    Run 2 Exa queries targeting Twitter/X, apply Gate 1 filters.
    Returns list of normalized lead dicts (no Gemini yet).
    """
    if not _get_clients():
        print("[TwitterFetcher] No Exa API keys configured — skipping")
        return []

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")

    seen_urls: set[str] = set()
    leads: list[dict]   = []

    for query in SEARCH_QUERIES:
        try:
            # search_and_contents fetches actual tweet text via text kwarg
            results = _exa_search(
                query,
                type="neural",
                num_results=25,
                category="tweet",
                start_published_date=cutoff,
                text={"max_characters": 1000},
            )
            print(f"[TwitterFetcher] Query '{query[:55]}...' → {len(results)} raw results")
        except Exception as e:
            print(f"[TwitterFetcher] Exa search failed: {e}")
            results = []

        for r in results:
            url = r.url or ""
            if url in seen_urls:
                continue
            seen_urls.add(url)

            lead = _normalize_result(r)
            if lead:
                leads.append(lead)

        time.sleep(0.5)

    print(f"[TwitterFetcher] Gate 1 passed: {len(leads)} leads from {len(seen_urls)} raw results")
    return leads
