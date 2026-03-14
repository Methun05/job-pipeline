"""
Email reveal chain diagnostic tests.
Tests every layer: Apollo contact finding, Hunter contact + email, credits logic,
and the dashboard API route's pre-conditions.

Run: python3 -m tests.test_email_chain
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

import requests
from pipeline.config import APOLLO_API_KEY, HUNTER_API_KEY, HTTP_TIMEOUT
import pipeline.apollo as apollo_mod
import pipeline.hunter as hunter_mod
import pipeline.db as db

PASS = "\033[92m PASS\033[0m"
FAIL = "\033[91m FAIL\033[0m"
WARN = "\033[93m WARN\033[0m"
INFO = "\033[94m INFO\033[0m"

results = []

def check(name, passed, detail=""):
    tag = PASS if passed else FAIL
    print(f"[{tag}] {name}")
    if detail:
        print(f"       {detail}")
    results.append((name, passed))


# ── 1. API keys present ───────────────────────────────────────────────────────

print("\n=== 1. API KEY PRESENCE ===")
check("APOLLO_API_KEY loaded",  bool(APOLLO_API_KEY),  f"key={'SET' if APOLLO_API_KEY else 'MISSING'}")
check("HUNTER_API_KEY loaded",  bool(HUNTER_API_KEY),  f"key={'SET' if HUNTER_API_KEY else 'MISSING'}")


# ── 2. Apollo credits ─────────────────────────────────────────────────────────

print("\n=== 2. APOLLO CREDIT BALANCE ===")
credits = apollo_mod.get_credit_balance()
print(f"[{INFO}] get_credit_balance() returned: {repr(credits)}")
check("Apollo credits readable (not None)", credits is not None,
      "If None → /auth/health call failed or wrong key — Apollo email reveal will NEVER run in dashboard")

# Simulate what the dashboard route does
try:
    row = db.get_client().table("settings").select("key,value").eq("key","apollo_credits_remaining").execute()
    stored = row.data[0]["value"] if row.data else None
    parsed_credits = int(stored or "0")
    print(f"[{INFO}] DB settings.apollo_credits_remaining = {repr(stored)} → parsed as {parsed_credits}")
    check("apollo_credits_remaining in DB is a valid integer > 0",
          parsed_credits > 0,
          f"Dashboard does `parseInt(value || '0')` — if this is 0 or NaN, Apollo reveal is SKIPPED entirely")
except Exception as e:
    check("apollo_credits_remaining readable from DB", False, str(e))


# ── 3. Apollo people search (free, no credits) ────────────────────────────────

print("\n=== 3. APOLLO PEOPLE SEARCH (no credits used) ===")

TEST_CASES = [
    ("Coinbase",       "coinbase.com"),
    ("Uniswap Labs",   "uniswap.org"),
    ("Alchemy",        "alchemy.com"),
]

for company, domain in TEST_CASES:
    try:
        result = apollo_mod.find_contact(company, domain, None)
        if result:
            check(f"Apollo find_contact: {company}", True,
                  f"name={result.get('name')} | title={result.get('title')} | apollo_id={result.get('apollo_person_id')}")
        else:
            check(f"Apollo find_contact: {company}", False, "Returned None (no people found for these titles)")
    except Exception as e:
        check(f"Apollo find_contact: {company}", False, str(e))


# ── 4. Hunter domain search ───────────────────────────────────────────────────

print("\n=== 4. HUNTER DOMAIN SEARCH ===")

HUNTER_CASES = [
    ("Coinbase",     "coinbase.com"),
    ("Alchemy",      "alchemy.com"),
    ("Uniswap Labs", "uniswap.org"),
]

for company, domain in HUNTER_CASES:
    try:
        result = hunter_mod.find_contact(company, domain, None)
        if result:
            check(f"Hunter find_contact: {domain}", True,
                  f"name={result.get('name')} | title={result.get('title')} | email={result.get('_hunter_email')}")
        else:
            check(f"Hunter find_contact: {domain}", False,
                  "No emails found in Hunter's index for this domain")
    except Exception as e:
        check(f"Hunter find_contact: {domain}", False, str(e))


# ── 5. Hunter email finder ────────────────────────────────────────────────────

print("\n=== 5. HUNTER EMAIL FINDER ===")

EMAIL_CASES = [
    ("Brian",  "Armstrong", "coinbase.com"),
    ("Hayden", "Adams",     "uniswap.org"),
]

for first, last, domain in EMAIL_CASES:
    try:
        email = hunter_mod.find_email(first, last, domain)
        check(f"Hunter find_email: {first} {last} @ {domain}",
              bool(email), f"email={email}")
    except Exception as e:
        check(f"Hunter find_email: {first} {last} @ {domain}", False, str(e))


# ── 6. Dashboard route pre-conditions ─────────────────────────────────────────

print("\n=== 6. DASHBOARD ROUTE PRE-CONDITION SIMULATION ===")

# 6a: FundedCompanyCard bug — early return if no apollo_person_id
print(f"\n[{INFO}] Simulating FundedCompanyCard.handleRevealEmail()...")
print(f"[{INFO}] Code: `if (!contact?.apollo_person_id) return;`")
print(f"[{INFO}] Hunter contacts always have apollo_person_id=null.")
check("FundedCompanyCard passes contact_name + contact_domain to API", False,
      "BUG: handleRevealEmail() only passes apollo_person_id — no contact_name or contact_domain. "
      "Hunter fallback in route.ts can NEVER trigger from Track A expand row.")

check("FundedCompanyCard allows Hunter contacts (apollo_person_id=null)",  False,
      "BUG: `if (!contact?.apollo_person_id) return` silently exits for ALL Hunter-sourced contacts.")

# 6b: Jobs page passes domain correctly?
print(f"\n[{INFO}] Jobs page findEmail() passes contact_domain = company.domain || company.website")
print(f"[{INFO}] Hunter route strips http:// — domain format is fine IF the field is populated.")

try:
    # Check a sample job to see if company.domain is typically populated
    sample = db.get_client().table("job_postings").select("*, companies(*)").limit(5).execute()
    jobs = sample.data or []
    missing_domain = [j for j in jobs if not (j.get("companies") or {}).get("domain") and not (j.get("companies") or {}).get("website")]
    check(f"Sample jobs have company domain/website ({len(jobs)-len(missing_domain)}/{len(jobs)} populated)",
          len(missing_domain) == 0,
          f"{len(missing_domain)} jobs have no domain → Hunter can't run for those")
except Exception as e:
    check("Sample jobs domain check", False, str(e))

# 6c: Apollo reveal needs apollo_person_id
try:
    sample = db.get_client().table("job_postings").select("*, contacts(*)").limit(10).execute()
    jobs   = sample.data or []
    contacts_with_apollo = [j for j in jobs if (j.get("contacts") or {}).get("apollo_person_id")]
    contacts_without     = [j for j in jobs if j.get("contacts") and not (j.get("contacts") or {}).get("apollo_person_id")]
    print(f"\n[{INFO}] Sample job contacts: {len(contacts_with_apollo)} have apollo_person_id, {len(contacts_without)} don't (Hunter-sourced)")
    check("At least some Track B contacts have apollo_person_id",
          len(contacts_with_apollo) > 0,
          "If 0 → Apollo People Search is returning nothing for job companies (small/new companies not in Apollo)")
except Exception as e:
    check("Track B contacts apollo_person_id check", False, str(e))


# ── Summary ───────────────────────────────────────────────────────────────────

print("\n" + "="*60)
passed = sum(1 for _, p in results if p)
failed = sum(1 for _, p in results if not p)
print(f"Results: {passed} passed, {failed} failed out of {len(results)} checks\n")
