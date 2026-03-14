"""
Backfill missing company domain, website, and LinkedIn for all companies
that currently have nulls in the companies table.

Uses:
  - Hunter /companies/find → domain + linkedin
  - Exa/Tavily → LinkedIn (via find_company_linkedin)

Run: python3 -m scripts.backfill_company_socials
"""
import os, sys, time, requests
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

import pipeline.db as db
from pipeline.config import HUNTER_API_KEY, HTTP_TIMEOUT
from pipeline.enrichment.exa_finder import find_company_linkedin
from pipeline.dedup.matcher import normalize_domain


def hunter_find_company(company_name: str) -> dict:
    """Hunter /companies/find by name → {domain, linkedin}"""
    if not HUNTER_API_KEY:
        return {}
    try:
        resp = requests.get(
            "https://api.hunter.io/v2/companies/find",
            params={"company": company_name, "api_key": HUNTER_API_KEY},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json().get("data") or {}
        return {
            "domain":   data.get("domain"),
            "linkedin": data.get("linkedin"),
        }
    except Exception as e:
        print(f"  [Hunter] Error for {company_name}: {e}")
        return {}


def run():
    client = db.get_client()

    # Fetch all companies missing domain OR linkedin_url
    rows = client.table("companies").select("id, name, domain, website, linkedin_url").execute()
    companies = rows.data or []

    missing = [
        c for c in companies
        if not c.get("domain") and not c.get("website") or not c.get("linkedin_url")
    ]

    print(f"Found {len(missing)} companies with missing domain or LinkedIn out of {len(companies)} total\n")

    updated = 0
    for c in missing:
        name    = c.get("name", "")
        domain  = c.get("domain") or normalize_domain(c.get("website") or "")
        updates = {}

        print(f"[{name}] domain={domain or 'missing'} | linkedin={c.get('linkedin_url') or 'missing'}")

        # ── Step 1: Hunter company lookup (gets domain + linkedin together) ──
        if not domain or not c.get("linkedin_url"):
            time.sleep(0.5)
            hunter = hunter_find_company(name)
            if hunter.get("domain") and not domain:
                domain = hunter["domain"]
                updates["domain"]  = domain
                updates["website"] = f"https://{domain}"
                print(f"  [Hunter] Found domain: {domain}")
            if hunter.get("linkedin") and not c.get("linkedin_url"):
                updates["linkedin_url"] = hunter["linkedin"]
                print(f"  [Hunter] Found LinkedIn: {hunter['linkedin']}")

        # ── Step 2: Exa/Tavily for LinkedIn if still missing ────────────────
        if not c.get("linkedin_url") and "linkedin_url" not in updates:
            try:
                linkedin = find_company_linkedin(name, domain or "")
                if linkedin:
                    updates["linkedin_url"] = linkedin
                    print(f"  [Exa/Tavily] Found LinkedIn: {linkedin}")
            except Exception as e:
                print(f"  [Exa/Tavily] Error: {e}")

        if updates:
            client.table("companies").update(updates).eq("id", c["id"]).execute()
            updated += 1
            print(f"  ✓ Saved: {list(updates.keys())}")
        else:
            print(f"  — No data found")

    print(f"\nDone. Updated {updated}/{len(missing)} companies.")


if __name__ == "__main__":
    run()
