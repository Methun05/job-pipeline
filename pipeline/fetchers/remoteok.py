"""
RemoteOK API — free, no auth required.
Docs: https://remoteok.com/api
"""
import requests
from datetime import datetime, timezone, timedelta
from pipeline.config import HTTP_TIMEOUT, TRACK_B_HOURS_WINDOW

API_URL = "https://remoteok.com/api"


def fetch() -> list[dict]:
    """
    Returns normalized job dicts with raw_data included.
    Role filtering happens in main.py after all fetchers run.
    """
    results = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TRACK_B_HOURS_WINDOW)

    try:
        resp = requests.get(
            API_URL,
            headers={"User-Agent": "job-pipeline/1.0"},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"RemoteOK fetch failed: {e}")

    # First item is metadata, skip it
    for item in data[1:]:
        try:
            if not isinstance(item, dict):
                continue

            # Date check
            epoch = item.get("epoch") or item.get("date")
            if epoch:
                posted = datetime.fromtimestamp(int(epoch), tz=timezone.utc)
                if posted < cutoff:
                    continue
            else:
                continue

            results.append({
                "job_title":    item.get("position", ""),
                "company_name": item.get("company", ""),
                "company_website": item.get("company_website") or item.get("url", ""),
                "job_url":      f"https://remoteok.com/remote-jobs/{item.get('id', '')}",
                "description_raw": item.get("description", ""),
                "salary_min":   _parse_salary(item.get("salary_min")),
                "salary_max":   _parse_salary(item.get("salary_max")),
                "salary_currency": "USD",
                "location":     item.get("location", ""),
                "posted_at":    posted.isoformat(),
                "source":       "remoteok",
                "raw_data":     item,
            })
        except Exception:
            continue

    return results


def _parse_salary(val) -> float | None:
    try:
        return float(val) if val else None
    except (TypeError, ValueError):
        return None
