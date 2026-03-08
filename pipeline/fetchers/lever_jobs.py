"""
Lever.co public postings API — no auth required.
Fetches design jobs from a curated list of crypto/web3 companies + auto-discovered slugs.

API: GET https://api.lever.co/v0/postings/{slug}?mode=json
- 200 + list   → company uses Lever, may have jobs
- 200 + []     → uses Lever, no open roles right now
- 404          → company not on Lever
"""
import time
import re
import requests
from datetime import datetime, timezone

import pipeline.db as db
from pipeline.config import LEVER_COMPANIES, DESIGN_ROLE_KEYWORDS, HTTP_TIMEOUT

BASE_URL = "https://api.lever.co/v0/postings"


def company_to_slug(name: str) -> str:
    """Convert a company name to a likely Lever slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)   # remove punctuation except hyphens
    slug = re.sub(r"\s+", "-", slug)        # spaces → hyphens
    slug = re.sub(r"-+", "-", slug)         # collapse multiple hyphens
    return slug.strip("-")


def _strip_html(text: str) -> str:
    """Very light HTML tag stripper for Lever descriptions."""
    return re.sub(r"<[^>]+>", " ", text or "").strip()


def _is_design_role(posting: dict) -> bool:
    text = (
        posting.get("text", "") + " " +
        posting.get("categories", {}).get("team", "")
    ).lower()
    return any(kw in text for kw in DESIGN_ROLE_KEYWORDS)


def _parse_posting(posting: dict, slug: str) -> dict:
    """Map a Lever posting dict to our job_postings schema."""
    cats = posting.get("categories", {})

    # createdAt is Unix ms
    created_ms = posting.get("createdAt")
    if created_ms:
        posted_at = datetime.fromtimestamp(int(created_ms) / 1000, tz=timezone.utc).isoformat()
    else:
        posted_at = datetime.now(timezone.utc).isoformat()

    # Plain text description: prefer descriptionPlain, fall back to stripping HTML
    desc_plain = posting.get("descriptionPlain") or _strip_html(posting.get("description", ""))

    # Append list items (requirements, etc.) to description
    for section in posting.get("lists", []):
        items = section.get("content", "")
        desc_plain += "\n" + _strip_html(items)

    return {
        "job_title":       posting.get("text", "").strip(),
        "company_name":    slug,                         # refined after company upsert
        "company_website": f"https://jobs.lever.co/{slug}",
        "job_url":         posting.get("hostedUrl", ""),
        "description_raw": desc_plain.strip(),
        "salary_min":      None,
        "salary_max":      None,
        "salary_currency": "USD",
        "location":        cats.get("location", ""),
        "posted_at":       posted_at,
        "source":          "lever",
        "raw_data": {
            "lever_id":   posting.get("id"),
            "slug":       slug,
            "team":       cats.get("team"),
            "commitment": cats.get("commitment"),
            "level":      cats.get("level"),
        },
    }


def _fetch_slug(slug: str) -> list[dict]:
    """Fetch all postings for one Lever slug. Returns parsed job dicts."""
    url = f"{BASE_URL}/{slug}?mode=json"
    try:
        resp = requests.get(url, timeout=HTTP_TIMEOUT)
    except Exception as e:
        raise RuntimeError(f"Lever request failed for {slug}: {e}")

    if resp.status_code == 404:
        return []          # company not on Lever
    resp.raise_for_status()

    data = resp.json()
    if not isinstance(data, list):
        return []

    results = []
    for posting in data:
        if not isinstance(posting, dict):
            continue
        if not _is_design_role(posting):
            continue
        job_url = posting.get("hostedUrl", "")
        if not job_url:
            continue
        results.append(_parse_posting(posting, slug))

    return results


def fetch() -> list[dict]:
    """
    Main entry point called by main.py.
    Loads slugs from LEVER_COMPANIES config + confirmed DB slugs,
    fetches each one, returns all matching design job dicts.
    """
    # Merge static config list + DB-confirmed slugs (deduped)
    db_slugs = [row["slug"] for row in db.get_lever_companies()]
    all_slugs = list(dict.fromkeys(LEVER_COMPANIES + db_slugs))  # preserve order, dedup

    all_jobs: list[dict] = []

    for slug in all_slugs:
        try:
            jobs = _fetch_slug(slug)
            if jobs:
                print(f"[Lever] {slug}: {len(jobs)} design role(s)")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"[Lever] Error fetching {slug}: {e}")
        time.sleep(0.5)  # be polite to Lever's servers

    return all_jobs


def probe_lever_slug(company_name: str) -> bool:
    """
    Called from Track A for each newly funded company.
    Tries to hit Lever API with a guessed slug. If 200 → saves slug to DB.
    Returns True if confirmed.
    """
    slug = company_to_slug(company_name)
    if not slug:
        return False

    # Skip slugs we already know about
    known = [row["slug"] for row in db.get_lever_companies()]
    if slug in known or slug in LEVER_COMPANIES:
        return True

    try:
        resp = requests.get(f"{BASE_URL}/{slug}?mode=json", timeout=HTTP_TIMEOUT)
    except Exception:
        return False

    if resp.status_code == 200 and isinstance(resp.json(), list):
        db.save_lever_company(slug, company_name)
        print(f"[Lever] Auto-discovered: {slug} ({company_name})")
        return True

    return False
