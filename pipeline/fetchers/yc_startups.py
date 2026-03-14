"""
YC Work at a Startup — Algolia JSON API.
App ID: 45BWZJ1SGC, API key embedded in the page (re-fetched if Algolia calls fail).
Filters for design roles with remote=true.
"""
import re
import json
import requests
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

ALGOLIA_APP_ID   = "45BWZJ1SGC"
ALGOLIA_INDEX    = "WaaSJobsProduction"
WAAS_PAGE_URL    = "https://www.workatastartup.com/jobs"
ALGOLIA_URL      = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries"

# Cached key — re-fetched automatically on 403 / key errors
_cached_api_key: str | None = None

DESIGN_ROLE_WORDS = [
    "product designer",
    "ux designer",
    "ui designer",
    "ux/ui",
    "ui/ux",
    "design lead",
]


def _fetch_api_key_from_page() -> str:
    """Scrape the WaaS page to find the embedded Algolia API key."""
    resp = requests.get(
        WAAS_PAGE_URL,
        timeout=HTTP_TIMEOUT,
        headers={"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"},
    )
    resp.raise_for_status()

    # Key appears in a <script> block: applicationId:"45BWZJ1SGC",apiKey:"<KEY>"
    m = re.search(r'apiKey["\s]*:["\s]*["\']([a-f0-9]{32})["\']', resp.text)
    if m:
        return m.group(1)

    # Fallback: look for it in a Next.js __NEXT_DATA__ JSON blob
    soup  = BeautifulSoup(resp.text, "lxml")
    script = soup.find("script", {"id": "__NEXT_DATA__"})
    if script:
        try:
            ndata = json.loads(script.string)
            # Walk looking for algolia key patterns
            text = json.dumps(ndata)
            m2 = re.search(r'"apiKey"\s*:\s*"([a-f0-9]{32})"', text)
            if m2:
                return m2.group(1)
        except Exception:
            pass

    raise RuntimeError("Could not find Algolia API key on WaaS page")


def _get_api_key() -> str:
    global _cached_api_key
    if not _cached_api_key:
        _cached_api_key = _fetch_api_key_from_page()
    return _cached_api_key


def _algolia_query(api_key: str) -> list[dict]:
    payload = {
        "requests": [
            {
                "indexName": ALGOLIA_INDEX,
                "params": (
                    "query=designer&"
                    "filters=remote%3Atrue&"
                    "hitsPerPage=100&"
                    "attributesToRetrieve=title,company_name,company_url,job_url,"
                    "location,description,salary,remote,created_at,objectID"
                ),
            }
        ]
    }
    resp = requests.post(
        ALGOLIA_URL,
        json=payload,
        headers={
            "X-Algolia-Application-Id": ALGOLIA_APP_ID,
            "X-Algolia-API-Key":        api_key,
            "Content-Type":             "application/json",
            "User-Agent":               "Mozilla/5.0 (compatible; job-pipeline/1.0)",
        },
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("results", [{}])[0].get("hits", [])


def fetch() -> list[dict]:
    global _cached_api_key

    try:
        api_key = _get_api_key()
        hits    = _algolia_query(api_key)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code in (401, 403):
            # Key rotated — re-fetch from page
            print("[YC] Algolia key invalid, re-fetching from page...")
            _cached_api_key = None
            api_key = _get_api_key()
            hits    = _algolia_query(api_key)
        else:
            raise RuntimeError(f"YC Algolia query failed: {e}")
    except Exception as e:
        raise RuntimeError(f"YC WaaS fetch failed: {e}")

    results = []
    for hit in hits:
        try:
            title   = (hit.get("title") or "").strip()
            company = (hit.get("company_name") or "").strip()

            # Only keep genuine design roles (Algolia query is broad)
            title_lower = title.lower()
            if not any(kw in title_lower for kw in DESIGN_ROLE_WORDS):
                continue

            job_url = (hit.get("job_url") or "").strip()
            if not job_url:
                obj_id  = hit.get("objectID", "")
                job_url = f"https://www.workatastartup.com/jobs/{obj_id}" if obj_id else ""
            if not job_url:
                continue

            description = (hit.get("description") or "").strip()
            location    = (hit.get("location") or "Remote").strip()

            # Salary — stored as string like "$120k - $160k" or int range
            sal_min = sal_max = None
            salary_raw = hit.get("salary") or ""
            if isinstance(salary_raw, str) and salary_raw:
                import re as _re
                m = _re.search(r"\$(\d+(?:\.\d+)?)k?\s*[-–]\s*\$?(\d+(?:\.\d+)?)k", salary_raw, _re.IGNORECASE)
                if m:
                    lo = float(m.group(1))
                    hi = float(m.group(2))
                    sal_min = int(lo * 1000) if lo < 1000 else int(lo)
                    sal_max = int(hi * 1000) if hi < 1000 else int(hi)

            posted_at = hit.get("created_at") or None

            results.append({
                "job_title":       title,
                "company_name":    company,
                "company_website": (hit.get("company_url") or "").strip(),
                "job_url":         job_url,
                "description_raw": description,
                "salary_min":      sal_min,
                "salary_max":      sal_max,
                "salary_currency": "USD",
                "location":        location,
                "posted_at":       posted_at,
                "source":          "yc_startups",
                "raw_data":        {"objectID": hit.get("objectID")},
            })
        except Exception:
            continue

    return results
