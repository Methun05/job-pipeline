"""
people_finder.py — Founder/CEO name discovery when Apollo and Hunter both return nothing.

Fallback chain:
  1. Exa neural search (linkedin.com/in/ profiles, key rotation key1 → key2)
  2. Tavily search (same query, triggered when Exa finds nothing)

Returns dict with keys: name, title, linkedin_url (all may be None except name).
No apollo_person_id — this is a pure discovery fallback, not a CRM lookup.
"""
import re
import requests
from pipeline.config import EXA_API_KEY, EXA_API_KEY_2, TAVILY_API_KEY, HTTP_TIMEOUT

# ── LinkedIn person profile URL pattern ────────────────────────────────────────
# Matches: linkedin.com/in/firstname-lastname
_LINKEDIN_PERSON_RE = re.compile(
    r'(?:https?://)?(?:[a-z]{2}\.)?linkedin\.com/in/([A-Za-z0-9_%-]+?)(?:[/?#]|$)',
    re.IGNORECASE,
)

# Title keywords that signal a founder/CEO profile
_FOUNDER_TITLES = re.compile(
    r'\b(CEO|Chief Executive|Founder|Co-Founder|Co Founder|CTO|Chief Technology|'
    r'Managing Director|President|General Partner)\b',
    re.IGNORECASE,
)


def _slug_to_name(slug: str) -> str:
    """
    Convert a LinkedIn URL slug to a display name.
    'john-smith-abc123' → 'John Smith'
    Strips trailing numeric tokens (IDs appended by LinkedIn).
    """
    parts = slug.split("-")
    # Drop trailing all-digit tokens (e.g. '4b3a2c1d')
    name_parts = []
    for p in parts:
        # Stop collecting if we hit a pure-digit or short hash-looking token after >=2 words
        if len(name_parts) >= 2 and re.fullmatch(r'[0-9a-f]{4,}', p, re.IGNORECASE):
            break
        if p:
            name_parts.append(p.capitalize())
    # Return at most first two tokens as first+last name to avoid noise
    return " ".join(name_parts[:2]) if name_parts else ""


def _extract_from_results(results: list[dict]) -> dict | None:
    """
    Parse a list of result dicts (each with 'url', 'title', 'content'/'snippet').
    Returns {name, title, linkedin_url} for the best founder/CEO match, or None.
    """
    for r in results:
        url     = r.get("url") or ""
        title   = r.get("title") or ""
        snippet = r.get("content") or r.get("snippet") or ""
        text    = f"{title} {snippet}"

        m = _LINKEDIN_PERSON_RE.search(url)
        if not m:
            continue

        slug    = m.group(1)
        name    = _slug_to_name(slug)
        if not name:
            continue

        # Extract title from snippet/title — prefer exact match
        title_match = _FOUNDER_TITLES.search(text)
        found_title = title_match.group(0).title() if title_match else "Founder"

        clean_url = url.split("?")[0].rstrip("/")
        return {
            "name":        name,
            "title":       found_title,
            "linkedin_url": clean_url,
        }

    return None


# ── Exa search (with key rotation) ────────────────────────────────────────────

_EXA_URL = "https://api.exa.ai/search"

def _exa_search_people(query: str) -> list[dict]:
    """
    Raw Exa /search call scoped to linkedin.com/in/ profiles.
    Rotates key1 → key2 on quota/rate error.
    Returns list of result dicts or [] on hard failure.
    """
    keys = [k for k in (EXA_API_KEY, EXA_API_KEY_2) if k]
    if not keys:
        return []

    payload = {
        "query":          query,
        "type":           "neural",
        "numResults":     5,
        "includeDomains": ["linkedin.com/in"],
        "contents":       {"text": False},  # we only need URL + title
    }

    for i, key in enumerate(keys):
        try:
            resp = requests.post(
                _EXA_URL,
                json=payload,
                headers={"x-api-key": key, "Content-Type": "application/json"},
                timeout=HTTP_TIMEOUT,
            )
            if resp.status_code in (429, 402):
                print(f"[Exa people_finder] Key {i+1} quota hit — rotating")
                continue
            resp.raise_for_status()
            data = resp.json()
            # Exa returns results as list of objects with url, title, etc.
            raw = data.get("results") or []
            # Normalise to dicts
            results = []
            for item in raw:
                if isinstance(item, dict):
                    results.append(item)
                else:
                    # exa_py Result object — access attrs
                    results.append({
                        "url":     getattr(item, "url", ""),
                        "title":   getattr(item, "title", ""),
                        "content": getattr(item, "text", ""),
                    })
            return results
        except Exception as e:
            err = str(e).lower()
            is_quota = any(kw in err for kw in ("quota", "rate", "429", "402", "limit", "exceeded"))
            if is_quota and i + 1 < len(keys):
                print(f"[Exa people_finder] Key {i+1} error ({e}) — rotating")
                continue
            print(f"[Exa people_finder] Error: {e}")
            return []

    return []


# ── Tavily search fallback ─────────────────────────────────────────────────────

_TAVILY_URL = "https://api.tavily.com/search"

def _tavily_search_people(query: str) -> list[dict]:
    """
    Tavily /search scoped to linkedin.com/in/ profiles.
    Returns list of result dicts or [] on failure.
    """
    if not TAVILY_API_KEY:
        return []
    try:
        resp = requests.post(
            _TAVILY_URL,
            json={
                "api_key":         TAVILY_API_KEY,
                "query":           query,
                "search_depth":    "basic",
                "max_results":     5,
                "include_domains": ["linkedin.com/in"],
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as e:
        print(f"[Tavily people_finder] Error: {e}")
        return []


# ── Public API ─────────────────────────────────────────────────────────────────

def find_person(company_name: str, domain: str) -> dict | None:
    """
    Discover a founder/CEO name for a company when Apollo and Hunter both fail.

    Steps:
      1. Exa neural search on linkedin.com/in/ (key1 → key2 on quota)
      2. Tavily search on linkedin.com/in/ (if Exa returns nothing)

    Returns:
      {"name": str, "title": str, "linkedin_url": str | None}
      or None if nothing found.

    The returned dict is compatible with contact_data in main.py —
    no apollo_person_id, no org_* keys.
    """
    query = f"founder CEO {company_name} site:linkedin.com"

    # ── Step 1: Exa ───────────────────────────────────────────────────────────
    exa_results = _exa_search_people(query)
    if exa_results:
        result = _extract_from_results(exa_results)
        if result:
            print(f"[people_finder] Exa found: {result['name']} ({result['title']}) — {result['linkedin_url']}")
            return result

    # ── Step 2: Tavily ────────────────────────────────────────────────────────
    tavily_results = _tavily_search_people(query)
    if tavily_results:
        result = _extract_from_results(tavily_results)
        if result:
            print(f"[people_finder] Tavily found: {result['name']} ({result['title']}) — {result['linkedin_url']}")
            return result

    print(f"[people_finder] No founder found for {company_name} ({domain})")
    return None
