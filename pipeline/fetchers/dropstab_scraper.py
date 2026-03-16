"""
DropsTab funding rounds — scrapes the Next.js SSR HTML list page, then fetches
each company's individual page for structured link data.
No API key required. No Playwright.

List page: https://dropstab.com/latest-fundraising-rounds
  - Parsed with BeautifulSoup HTML table
  - Extracts: name, amount, stage, date, slug from href
  - Early filter: date within 45 days + amount $1M–$50M

Company page: https://dropstab.com/coins/{slug}/fundraising
  - Extracts __NEXT_DATA__ → props.pageProps.coin.links[]
  - type == "WEBSITE"  → website URL
  - type == "TWITTER"  → twitter URL (high confidence — from source)
  - type == "LINKEDIN" → company LinkedIn URL
  - Sleep 1s between requests (same as CryptoRank)
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
    "pre-series a":      "Pre-Series A",
    "pre-seed":          "Pre-Seed",
    "series a":          "Series A",
    "series b":          "Series B",
    "series c":          "Series C",
    "strategic":         "Strategic",
    "strategic round":   "Strategic",
    "grant":             "Grant",
    # unmapped: "funding round", "public sale", etc → None (not dropped)
}


def _parse_amount(text: str):
    """Parse '$13.00 M' → 13_000_000.0, '$3.00 M' → 3_000_000.0, etc."""
    if not text:
        return None
    m = re.match(r'\$?([\d,.]+)\s*([MBK])?', text.strip(), re.IGNORECASE)
    if not m:
        return None
    val = float(m.group(1).replace(',', ''))
    suffix = (m.group(2) or '').upper()
    if suffix == 'B':
        val *= 1_000_000_000
    elif suffix == 'M':
        val *= 1_000_000
    elif suffix == 'K':
        val *= 1_000
    return val


def _parse_date(date_str: str):
    """Parse 'Mar 13, 2026' → datetime(UTC)."""
    try:
        return datetime.strptime(date_str.strip(), "%b %d, %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _fetch_company_links(slug: str) -> tuple[str, str, str]:
    """
    Fetch website, twitter URL, and LinkedIn URL from the company's DropsTab page.
    Returns (website, twitter_url, linkedin_url) — empty strings on any failure.
    """
    try:
        time.sleep(1)
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

    Stage is optional metadata — unmapped stages stored as None, never dropped.
    Amount ($1M–$50M) and date (last 45 days) are the only hard filters.
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

    # Try __NEXT_DATA__ first (faster, no HTML parsing guesswork)
    script = soup.find("script", {"id": "__NEXT_DATA__"})
    if script:
        try:
            return _parse_from_next_data(json.loads(script.string), cutoff)
        except Exception:
            pass

    # Fall back to HTML table parsing
    return _parse_from_html(soup, cutoff)


def _parse_from_next_data(data: dict, cutoff: datetime) -> list[dict]:
    """Parse rounds from __NEXT_DATA__ JSON embedded in the list page."""
    rounds = (
        data.get("props", {})
        .get("pageProps", {})
        .get("fundraisingRounds", [])
    ) or (
        data.get("props", {})
        .get("pageProps", {})
        .get("rounds", [])
    ) or []

    if not rounds:
        raise ValueError("No rounds found in __NEXT_DATA__")

    results = []
    for item in rounds:
        try:
            result = _process_round_item(item, cutoff)
            if result:
                results.append(result)
        except Exception:
            continue
    return results


def _process_round_item(item: dict, cutoff: datetime):
    """Process a single round dict (from __NEXT_DATA__). Returns dict or None."""
    # Date
    date_str = item.get("date") or item.get("createdAt") or item.get("announcedAt") or ""
    if not date_str:
        return None
    try:
        if "T" in date_str or "Z" in date_str:
            announced = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        else:
            announced = _parse_date(date_str)
    except Exception:
        return None
    if not announced or announced < cutoff:
        return None

    # Name + slug
    name = item.get("name") or (item.get("coin") or {}).get("name") or ""
    if not name:
        return None
    slug = item.get("slug") or (item.get("coin") or {}).get("slug") or ""

    # Amount
    amount_raw = item.get("amount") or item.get("raise") or item.get("totalRaised") or ""
    if isinstance(amount_raw, (int, float)):
        amount = float(amount_raw)
    else:
        amount = _parse_amount(str(amount_raw))
    if not amount:
        return None
    if not (FUNDING_MIN_USD <= amount <= FUNDING_MAX_USD):
        return None

    # Stage
    stage_raw  = (item.get("stage") or item.get("roundType") or item.get("type") or "").lower().strip()
    round_type = STAGE_MAP.get(stage_raw)

    # Category
    category = item.get("category") or (item.get("coin") or {}).get("category") or ""

    # Fetch company links
    website, twitter_url, linkedin_url = _fetch_company_links(slug) if slug else ("", "", "")

    return {
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
            "slug":       slug,
            "category":   category,
            "stage_raw":  stage_raw,
            "twitter_url": twitter_url,   # also in raw_data for funded_leads record
        },
    }


def _parse_from_html(soup: BeautifulSoup, cutoff: datetime) -> list[dict]:
    """
    Fall-back HTML table parser for the list page.
    Parses rows from the funding rounds table.
    """
    results = []

    # Find table rows — DropsTab renders a <table> or <div>-based list
    rows = soup.select("table tbody tr")
    if not rows:
        # Try div-based rows
        rows = soup.select("[data-testid='round-row'], .round-row, .funding-row")

    for row in rows:
        try:
            cells = row.find_all("td")
            if len(cells) < 3:
                continue

            # Extract slug from the first anchor
            anchor = row.find("a", href=True)
            if not anchor:
                continue
            href = anchor["href"]  # e.g. /coins/projectname/fundraising
            parts = [p for p in href.split("/") if p]
            # Expected: ["coins", "{slug}", "fundraising"]
            if len(parts) < 2:
                continue
            slug = parts[1] if parts[0] == "coins" else parts[0]

            # Name — first cell or anchor text
            name = anchor.get_text(strip=True) or cells[0].get_text(strip=True)
            if not name:
                continue

            # Scan cells for amount (contains '$') and date (contains month name)
            amount = None
            announced = None
            stage_raw = ""
            for cell in cells:
                text = cell.get_text(strip=True)
                if not amount and "$" in text:
                    amount = _parse_amount(text)
                if not announced:
                    dt = _parse_date(text)
                    if dt:
                        announced = dt
                # Rough stage detection
                if not stage_raw and any(
                    kw in text.lower()
                    for kw in ["seed", "series", "strategic", "grant", "funding round", "public sale"]
                ):
                    stage_raw = text.lower().strip()

            if not announced or announced < cutoff:
                continue
            if not amount or not (FUNDING_MIN_USD <= amount <= FUNDING_MAX_USD):
                continue

            round_type = STAGE_MAP.get(stage_raw)
            website, twitter_url, linkedin_url = _fetch_company_links(slug)

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
                    "slug":       slug,
                    "category":   "",
                    "stage_raw":  stage_raw,
                    "twitter_url": twitter_url,
                },
            })
        except Exception:
            continue

    return results
