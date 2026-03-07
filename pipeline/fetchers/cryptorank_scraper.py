"""
CryptoRank funding rounds — scrapes the Next.js SSR data embedded in the page.
No API key required. No Playwright. Two HTTP requests per run:
  1. Fetch page to get current Next.js buildId
  2. Fetch /_next/data/{buildId}/funding-rounds.json for structured JSON

Returns ~20 most recent funding rounds per run.
"""
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
from pipeline.config import TRACK_A_DAYS_WINDOW, FUNDING_MIN_USD, FUNDING_MAX_USD, HTTP_TIMEOUT

BASE_URL   = "https://cryptorank.io"
HEADERS    = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":     "application/json, text/html",
}

STAGE_MAP = {
    "pre_seed":  "Pre-Seed",
    "preseed":   "Pre-Seed",
    "pre-seed":  "Pre-Seed",
    "seed":      "Seed",
    "series_a":  "Series A",
    "series a":  "Series A",
    "seriesa":   "Series A",
    "series_b":  "Series B",
    "series b":  "Series B",
    "seriesb":   "Series B",
}


def _get_build_id() -> str:
    resp = requests.get(f"{BASE_URL}/funding-rounds", headers=HEADERS, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    script = BeautifulSoup(resp.text, "lxml").find("script", {"id": "__NEXT_DATA__"})
    if not script:
        raise RuntimeError("CryptoRank: __NEXT_DATA__ script tag not found")
    return json.loads(script.string)["buildId"]


def fetch() -> list[dict]:
    """
    Returns list of normalized funded company dicts matching our filters.
    Each dict: {name, website, funding_amount, funding_currency, round_type, announced_date, source}
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRACK_A_DAYS_WINDOW)

    try:
        build_id = _get_build_id()
        resp = requests.get(
            f"{BASE_URL}/_next/data/{build_id}/funding-rounds.json",
            headers=HEADERS,
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        rounds = resp.json().get("pageProps", {}).get("fallbackRounds", {}).get("data", [])
    except Exception as e:
        raise RuntimeError(f"CryptoRank scraper failed: {e}")

    results = []
    for item in rounds:
        try:
            # Date filter
            date_str = item.get("date") or item.get("createdAt") or ""
            if not date_str:
                continue
            announced = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if announced < cutoff:
                continue

            # Stage filter
            stage_raw  = (item.get("stage") or "").lower().replace(" ", "_")
            round_type = STAGE_MAP.get(stage_raw)
            if not round_type:
                continue

            # Amount filter
            amount = item.get("raise") or item.get("publicSalesRaise")
            if not amount:
                continue
            amount = float(amount)
            if not (FUNDING_MIN_USD <= amount <= FUNDING_MAX_USD):
                continue

            name = item.get("name") or ""
            if not name:
                continue

            # No company website in the API response — leave empty so Apollo
            # skips domain search rather than searching against cryptorank.io
            key     = item.get("key", "")
            website = ""

            results.append({
                "name":             name,
                "website":          website,
                "funding_amount":   amount,
                "funding_currency": "USD",
                "round_type":       round_type,
                "announced_date":   announced.date().isoformat(),
                "source":           "cryptorank",
                "raw_data":         {
                    "key":     key,
                    "symbol":  item.get("symbol"),
                    "country": item.get("country"),
                    "funds":   [f.get("name") for f in item.get("funds", [])],
                },
            })
        except Exception:
            continue

    return results
