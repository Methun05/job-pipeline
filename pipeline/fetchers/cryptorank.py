"""
CryptoRank API v2 — recently funded crypto companies.
Docs: https://cryptorank.io/public-api
Endpoint: GET /v2/funding-rounds (or /v2/ieo — adjust if needed based on your API tier)
"""
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import CRYPTORANK_API_KEY, FUNDING_MIN_USD, FUNDING_MAX_USD, TRACK_A_DAYS_WINDOW, HTTP_TIMEOUT

BASE_URL = "https://api.cryptorank.io/v2"

VALID_ROUNDS = {"pre-seed", "seed", "series a", "series b"}


def fetch() -> list[dict]:
    """
    Returns list of normalized funded company dicts.
    Each dict: {name, website, funding_amount, funding_currency, round_type, announced_date, source, raw_data}
    """
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRACK_A_DAYS_WINDOW)

    try:
        # CryptoRank v2 funding rounds endpoint
        resp = requests.get(
            f"{BASE_URL}/funding-rounds",
            params={
                "api_key":  CRYPTORANK_API_KEY,
                "limit":    100,
                "offset":   0,
                "sort":     "date",
                "order":    "desc",
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        rounds = data.get("data", [])
    except Exception as e:
        raise RuntimeError(f"CryptoRank fetch failed: {e}")

    for item in rounds:
        try:
            # Date check
            date_str = item.get("date") or item.get("announcedAt") or ""
            if not date_str:
                continue
            announced = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if announced < cutoff:
                continue

            # Round type filter
            round_raw = (item.get("roundType") or item.get("stage") or "").lower()
            # Map CryptoRank naming to our canonical names
            round_map = {
                "pre-seed": "Pre-Seed",
                "preseed":  "Pre-Seed",
                "seed":     "Seed",
                "series a": "Series A",
                "series_a": "Series A",
                "seriesa":  "Series A",
                "series b": "Series B",
                "series_b": "Series B",
                "seriesb":  "Series B",
            }
            round_type = round_map.get(round_raw)
            if not round_type:
                continue

            # Amount filter (convert to USD if needed)
            amount = item.get("raisedAmount") or item.get("amount") or 0
            currency = item.get("currency", "USD").upper()
            amount_usd = float(amount)  # CryptoRank usually provides USD
            if not (FUNDING_MIN_USD <= amount_usd <= FUNDING_MAX_USD):
                continue

            # Company info
            company = item.get("project") or item.get("company") or {}
            name = company.get("name") or item.get("name") or ""
            website = company.get("website") or item.get("website") or ""
            if not name:
                continue

            results.append({
                "name":             name,
                "website":          website,
                "funding_amount":   amount_usd,
                "funding_currency": "USD",
                "round_type":       round_type,
                "announced_date":   announced.date().isoformat(),
                "source":           "cryptorank",
                "raw_data":         item,
            })
        except Exception:
            continue

    return results
