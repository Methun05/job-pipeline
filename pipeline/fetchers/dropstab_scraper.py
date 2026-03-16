"""
DropsTab funding rounds — scrapes the Next.js SSR data embedded in the page.
No API key required. No Playwright. Two HTTP requests per company:
  1. Fetch list page → parse __NEXT_DATA__ → props.pageProps.fallbackBody.content
     (50 items per page, date as Unix ms timestamp, fundsRaised as float)
  2. Per company: fetch /coins/{slug}/fundraising → __NEXT_DATA__ coin.links[]
     for website, Twitter, LinkedIn URLs.

Stage filter is lenient — null/unmapped stage stored as None (not dropped).
Amount ($1M–$50M) and date (last 45 days) are the only hard filters.
"""
import json
import re
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
from pipeline.config import TRACK_A_DAYS_WINDOW, FUNDING_MIN_USD, FUNDING_MAX_USD, HTTP_TIMEOUT

BASE_URL = "https://dropstab.com"
HEADERS  = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

STAGE_MAP = {
    "seed round":        "Seed",
    "seed":              "Seed",
    "pre-seed":          "Pre-Seed",
    "pre-series a":      "Pre-Series A",
    "series a":          "Series A",
    "series b":          "Series B",
    "series c":          "Series C",
    "strategic":         "Strategic",
    "strategic round":   "Strategic",
    "grant":             "Grant",
    # "funding round", "public sale", "private token sale", "post-ipo", "m&a" → None (not dropped)
}


def _fetch_company_links(slug: str) -> tuple[str, str, str]:
    """
    Fetch website, twitter URL, and LinkedIn URL from the company's DropsTab page.
    Returns (website, twitter_url, linkedin_url) — empty strings on any failure.

    Link objects use `link` field (not `url`):
        {"type": "WEBSITE", "link": "https://..."}
    """
    try:
        time.sleep(1)  # avoid hammering DropsTab
        resp = requests.get(
            f"{BASE_URL}/coins/{slug}/fundraising",
            headers=HEADERS,
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        script = BeautifulSoup(resp.text, "lxml").find("script", {"id": "__NEXT_DATA__"})
        if not script:
            return "", "", ""
        links = (
            json.loads(script.string)
            .get("props", {})
            .get("pageProps", {})
            .get("coin", {})
            .get("links", [])
        )
        website  = next((l.get("link") or l.get("url", "") for l in links if l.get("type") == "WEBSITE"), "")
        twitter  = next((l.get("link") or l.get("url", "") for l in links if l.get("type") == "TWITTER"), "")
        linkedin = next((l.get("link") or l.get("url", "") for l in links if l.get("type") == "LINKEDIN"), "")
        return website, twitter, linkedin
    except Exception:
        return "", "", ""


def fetch() -> list[dict]:
    """
    Returns list of normalized funded company dicts matching our filters.
    Each dict: {name, website, linkedin_url, twitter_url, funding_amount,
                funding_currency, round_type, announced_date, source, raw_data}

    Key design decisions:
    - Stage is optional metadata — null/unmapped stored as None, never dropped.
    - Amount ($1M–$50M) and date (45 days) are the only hard filters.
    - __NEXT_DATA__ at props.pageProps.fallbackBody.content has 50 clean entries per page.
      announceDate is a Unix timestamp in milliseconds.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRACK_A_DAYS_WINDOW)

    try:
        resp = requests.get(
            f"{BASE_URL}/latest-fundraising-rounds",
            headers=HEADERS,
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"DropsTab scraper failed to load list page: {e}")

    soup = BeautifulSoup(resp.text, "lxml")
    script = soup.find("script", {"id": "__NEXT_DATA__"})
    if not script:
        raise RuntimeError("DropsTab: __NEXT_DATA__ script tag not found")

    data    = json.loads(script.string)
    content = (
        data.get("props", {})
        .get("pageProps", {})
        .get("fallbackBody", {})
        .get("content", [])
    )
    if not content:
        raise RuntimeError("DropsTab: fallbackBody.content not found or empty")

    results = []
    for item in content:
        try:
            # Date — Unix timestamp in milliseconds
            announce_ms = item.get("announceDate")
            if not announce_ms:
                continue
            announced = datetime.fromtimestamp(int(announce_ms) / 1000, tz=timezone.utc)
            if announced < cutoff:
                continue

            name = (item.get("name") or "").strip()
            if not name:
                continue

            slug = (item.get("slug") or "").strip()

            # Amount — already a float in the JSON
            amount = item.get("fundsRaised")
            if not amount:
                continue
            amount = float(amount)
            if not (FUNDING_MIN_USD <= amount <= FUNDING_MAX_USD):
                continue

            # Stage — optional, never a hard filter
            stage_raw  = (item.get("stage") or "").lower().strip()
            round_type = STAGE_MAP.get(stage_raw)  # None if unmapped — fine

            category = item.get("category") or ""

            # Fetch website + twitter + LinkedIn from individual company page
            website, twitter_url, linkedin_url = _fetch_company_links(slug) if slug else ("", "", "")

            results.append({
                "name":             name,
                "website":          website,
                "linkedin_url":     linkedin_url,
                "twitter_url":      twitter_url,
                "funding_amount":   amount,
                "funding_currency": "USD",
                "round_type":       round_type,
                "announced_date":   announced.date().isoformat(),
                "source":           "dropstab",
                "raw_data": {
                    "slug":        slug,
                    "category":    category,
                    "stage_raw":   stage_raw,
                    "twitter_url": twitter_url,  # also in raw_data for funded_leads record
                },
            })
        except Exception:
            continue

    return results
