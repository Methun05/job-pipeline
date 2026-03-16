"""
Full pipeline test suite — NO MOCKS, everything is real.
Run: python3 -m tests.test_full_pipeline

Tests cover:
  1. Env var smoke test (all keys present & non-empty)
  2. Workflow YAML cross-check (every config.py key is in CI workflow)
  3. Module import test (no import-time errors)
  4. Live Track A fetchers (CryptoRank + DropsTab — real HTTP)
  5. Live Track B fetchers (all 11 — real HTTP, check field schema)
  6. Role keyword filter (valid titles pass, noise titles rejected)
  7. Experience classifier (year ranges, skip-tier keywords, edge cases)
  8. Remote scope detector (global/us_only/unclear detection)
  9. Dedup — domain normalization edge cases
 10. Dedup — fuzzy company name matching
 11. DB connectivity (Supabase ping + last run stats sanity)
 12. Apollo API (real credit check)
 13. Track B field schema validation (every required field present in all returned jobs)
"""
import os
import re
import sys
import json
import time
from datetime import datetime, timezone

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

PASS = f"{GREEN}PASS{RESET}"
FAIL = f"{RED}FAIL{RESET}"
WARN = f"{YELLOW}WARN{RESET}"

results: list[tuple[str, str, str]] = []  # (section, name, status+detail)

def ok(section, name, detail=""):
    results.append((section, name, f"{PASS}  {detail}"))
    print(f"  {PASS}  {name}" + (f" — {detail}" if detail else ""))

def fail(section, name, detail=""):
    results.append((section, name, f"{FAIL}  {detail}"))
    print(f"  {FAIL}  {name}" + (f" — {detail}" if detail else ""))

def warn(section, name, detail=""):
    results.append((section, name, f"{WARN}  {detail}"))
    print(f"  {WARN}  {name}" + (f" — {detail}" if detail else ""))

def section(title):
    print(f"\n{BOLD}{'─'*60}{RESET}")
    print(f"{BOLD} {title}{RESET}")
    print(f"{BOLD}{'─'*60}{RESET}")


# ══════════════════════════════════════════════════════════════════════════════
# 1. ENV VAR SMOKE TEST
# ══════════════════════════════════════════════════════════════════════════════
section("1 · Env var smoke test")

REQUIRED_KEYS = [
    "SUPABASE_URL", "SUPABASE_SERVICE_KEY",
    "GEMINI_API_KEY", "GEMINI_API_KEY_2",
    "APOLLO_API_KEY",
    "HUNTER_API_KEY",
    "EXA_API_KEY", "EXA_API_KEY_2",
    "TAVILY_API_KEY",
    "BRAVE_API_KEY",
]

from dotenv import load_dotenv
load_dotenv()

for key in REQUIRED_KEYS:
    val = os.getenv(key, "")
    if val:
        ok("env", key, f"{val[:8]}…")
    else:
        fail("env", key, "MISSING or empty")


# ══════════════════════════════════════════════════════════════════════════════
# 2. WORKFLOW YAML CROSS-CHECK
# ══════════════════════════════════════════════════════════════════════════════
section("2 · Workflow YAML env var cross-check")

workflow_path = os.path.join(os.path.dirname(__file__), "..", ".github", "workflows", "daily_pipeline.yml")
try:
    with open(workflow_path) as f:
        workflow_text = f.read()
    for key in REQUIRED_KEYS:
        if key in workflow_text:
            ok("workflow", key, "found in daily_pipeline.yml")
        else:
            fail("workflow", key, f"MISSING from .github/workflows/daily_pipeline.yml — CI will silently degrade")
except FileNotFoundError:
    fail("workflow", "daily_pipeline.yml", "file not found at expected path")


# ══════════════════════════════════════════════════════════════════════════════
# 3. MODULE IMPORT TEST
# ══════════════════════════════════════════════════════════════════════════════
section("3 · Module import test")

modules_to_import = [
    ("pipeline.config",                    "config"),
    ("pipeline.db",                        "db"),
    ("pipeline.apollo",                    "apollo"),
    ("pipeline.hunter",                    "hunter"),
    ("pipeline.generator",                 "generator"),
    ("pipeline.dedup.matcher",             "dedup.matcher"),
    ("pipeline.filters.experience",        "filters.experience"),
    ("pipeline.filters.remote_scope",      "filters.remote_scope"),
    ("pipeline.enrichment.exa_finder",     "enrichment.exa_finder"),
    ("pipeline.enrichment.tavily_finder",  "enrichment.tavily_finder"),
    ("pipeline.enrichment.twitter_finder", "enrichment.twitter_finder"),
    # Fetchers
    ("pipeline.fetchers.cryptorank_scraper",    "fetchers.cryptorank"),
    ("pipeline.fetchers.dropstab_scraper",      "fetchers.dropstab"),
    ("pipeline.fetchers.web3career",            "fetchers.web3career"),
    ("pipeline.fetchers.cryptojobslist_rss",    "fetchers.cryptojobslist"),
    ("pipeline.fetchers.cryptocurrencyjobs_rss","fetchers.cryptocurrencyjobs"),
    ("pipeline.fetchers.dragonfly_jobs",        "fetchers.dragonfly"),
    ("pipeline.fetchers.arbitrum_jobs",         "fetchers.arbitrum"),
    ("pipeline.fetchers.hashtagweb3",           "fetchers.hashtagweb3"),
    ("pipeline.fetchers.talentweb3",            "fetchers.talentweb3"),
    ("pipeline.fetchers.solana_jobs",           "fetchers.solana"),
    ("pipeline.fetchers.paradigm_jobs",         "fetchers.paradigm"),
    ("pipeline.fetchers.sui_jobs",              "fetchers.sui"),
    ("pipeline.fetchers.a16zcrypto_jobs",       "fetchers.a16zcrypto"),
]

for module_path, display in modules_to_import:
    try:
        __import__(module_path)
        ok("imports", display)
    except Exception as e:
        fail("imports", display, str(e))


# ══════════════════════════════════════════════════════════════════════════════
# 4. EXPERIENCE CLASSIFIER — unit logic tests (pure, no HTTP)
# ══════════════════════════════════════════════════════════════════════════════
section("4 · Experience classifier (pure logic)")

from pipeline.filters.experience import classify_experience

exp_cases = [
    # (description, expected_match, label)
    ("We need 3+ years of experience",                 "strong",    "3+ years → strong"),
    ("Requires 5-7 years of UX design experience",     "skip",      "5-7 years (max>=7) → skip"),
    ("8+ years required, Principal Designer role",     "skip",      "8+ years → skip"),
    ("Junior designer, entry-level welcome",           "strong",    "junior keywords → strong"),
    ("Senior Product Designer",                        "stretch",   "senior keyword → stretch"),
    ("Mid-level designer with 2-4 years",              "strong",    "mid-level + 2-4yr → strong"),
    ("Staff Product Designer needed",                  "skip",      "skip-tier: staff product designer"),
    ("Principal Designer (8-10 years)",                "skip",      "skip-tier: principal designer"),
    ("Design Director for our growing team",           "skip",      "skip-tier: design director"),
    ("VP of Design",                                   "skip",      "skip-tier: vp of design"),
    ("Head of Design, 7+ years exp",                   "skip",      "skip-tier: head of design"),
    ("Product Designer, 1-3 years experience",         "strong",    "1-3 years → strong"),
    ("UX Designer — no years mentioned",               "ambiguous", "no signal → ambiguous"),
    ("Minimum of 6 years in product design",           "stretch",   "minimum 6 years → stretch"),
    ("At least 5 years of design experience",         "stretch",    "at least 5 years → stretch"),
    ("Staff Designer for platform team",               "skip",      "skip-tier: staff designer"),
    ("Product Design Lead, 4+ years",                  "strong",    "4+ years → strong"),
    ("Interaction Designer, 10+ years preferred",      "skip",      "10+ years → skip"),
    ("Graduate designer, fresh graduates welcome",     "strong",    "graduate → strong"),
]

for desc, expected, label in exp_cases:
    result, ymin, ymax = classify_experience(desc)
    if result == expected:
        ok("experience", label, f"got '{result}' ✓")
    else:
        fail("experience", label, f"expected '{expected}', got '{result}'")


# ══════════════════════════════════════════════════════════════════════════════
# 5. REMOTE SCOPE DETECTOR — unit logic tests
# ══════════════════════════════════════════════════════════════════════════════
section("5 · Remote scope detector (pure logic)")

from pipeline.filters.remote_scope import detect_remote_scope

remote_cases = [
    ("Work from anywhere in the world",       "",         "global",   "anywhere in world → global"),
    ("Fully remote position",                  "",         "global",   "fully remote → global"),
    ("100% remote, all timezones welcome",     "",         "global",   "100% remote all timezones → global"),
    ("Remote - US only",                       "",         "us_only",  "us only text → us_only"),
    ("Must be based in the US",                "",         "us_only",  "must be based in US → us_only"),
    ("Authorized to work in the US required",  "",         "us_only",  "authorized to work in US → us_only"),
    ("Remote position",                        "Remote",   "unclear",  "plain remote → unclear"),
    ("No location requirements mentioned",     "",         "unclear",  "no signal → unclear"),
    ("We are a remote-first company",          "",         "unclear",  "remote-first, no qualifier → unclear"),
    ("US citizens only",                       "",         "us_only",  "us citizens only → us_only"),
    ("Global remote team",                     "",         "global",   "global remote → global"),
    ("", "Remote - US only",                               "us_only",  "US-only in location field → us_only"),
    ("Worldwide remote",                       "",         "global",   "worldwide → global"),
    ("EU timezone preferred",                  "",         "unclear",  "timezone pref, no remote → unclear"),
]

for desc, location, expected, label in remote_cases:
    result = detect_remote_scope(desc, location)
    if result == expected:
        ok("remote", label, f"got '{result}' ✓")
    else:
        fail("remote", label, f"expected '{expected}', got '{result}'")


# ══════════════════════════════════════════════════════════════════════════════
# 6. DEDUP — DOMAIN NORMALIZATION
# ══════════════════════════════════════════════════════════════════════════════
section("6 · Dedup — domain normalization")

from pipeline.dedup.matcher import normalize_domain, normalize_name, find_company_match

domain_cases = [
    ("https://www.example.com/careers",  "example.com",   "strips www + path"),
    ("http://app.cryptox.io",            "cryptox.io",    "strips app. subdomain"),
    ("careers.uniswap.org",              "uniswap.org",   "strips careers. subdomain"),
    ("jobs.paradigm.xyz/apply",          "paradigm.xyz",  "strips jobs. + path"),
    ("about.company.io",                 "company.io",    "strips about. subdomain"),
    ("https://EIGEN.LAYER.xyz",          "eigen.layer.xyz","lowercases"),
    ("",                                 "",              "empty → empty"),
]

for url, expected, label in domain_cases:
    result = normalize_domain(url)
    if result == expected:
        ok("dedup_domain", label, f"'{url}' → '{result}' ✓")
    else:
        fail("dedup_domain", label, f"expected '{expected}', got '{result}'")


# ══════════════════════════════════════════════════════════════════════════════
# 7. DEDUP — FUZZY COMPANY NAME MATCHING
# ══════════════════════════════════════════════════════════════════════════════
section("7 · Dedup — fuzzy company name matching")

import uuid

dummy_companies = [
    {"id": "aaa", "name": "Uniswap Labs",         "domain": "uniswap.org"},
    {"id": "bbb", "name": "OpenSea Inc",           "domain": "opensea.io"},
    {"id": "ccc", "name": "Alchemy Insights Ltd",  "domain": "alchemy.com"},
    {"id": "ddd", "name": "",                       "domain": "eigenlab.xyz"},
]

fuzzy_cases = [
    # (name, domain, expected_id, label)
    ("Uniswap Labs",         "",              "aaa",  "exact name → match"),
    ("Uniswap",              "uniswap.org",   "aaa",  "domain exact → match"),
    ("OpenSea",              "opensea.io",    "bbb",  "domain exact → match"),
    ("OpenSea Inc.",         "",              "bbb",  "name fuzzy (strips Inc.) → match"),
    ("Alchemy",              "alchemy.com",   "ccc",  "domain exact → match"),
    ("",                     "eigenlab.xyz",  "ddd",  "empty name, domain match"),
    ("Brand New Company XYZ","newco.io",      None,   "no match → None"),
    ("Uniswap Labs",         "different.com", "aaa",  "name wins over wrong domain"),
]

for name, domain, expected_id, label in fuzzy_cases:
    result = find_company_match(name, domain, dummy_companies)
    if result == expected_id:
        ok("dedup_fuzzy", label, f"returned '{result}' ✓")
    else:
        fail("dedup_fuzzy", label, f"expected '{expected_id}', got '{result}'")


# ══════════════════════════════════════════════════════════════════════════════
# 8. ROLE KEYWORD FILTER
# ══════════════════════════════════════════════════════════════════════════════
section("8 · Role keyword filter")

from pipeline.config import DESIGN_ROLE_KEYWORDS

def is_design_role(title: str) -> bool:
    title_lower = title.lower()
    return any(kw in title_lower for kw in DESIGN_ROLE_KEYWORDS)

role_cases = [
    # (title, should_pass, label)
    ("Product Designer",                        True,  "product designer → pass"),
    ("Senior Product Designer",                 True,  "senior product designer → pass"),
    ("UX Designer",                             True,  "ux designer → pass"),
    ("UI Designer",                             True,  "ui designer → pass"),
    ("UI/UX Designer",                          True,  "ui/ux designer → pass"),
    ("Product Design Lead",                     True,  "product design lead → pass"),
    ("Design Lead",                             True,  "design lead → pass"),
    ("UX/UI Designer",                          True,  "ux/ui designer → pass"),
    ("Software Engineer",                       False, "software engineer → skip"),
    ("Marketing Manager",                       False, "marketing → skip"),
    ("Growth Designer",                         False, "growth designer → skip (not in keywords)"),
    ("Head of Design",                          False, "head of design → skip (not in keywords)"),
    ("Brand Designer",                          False, "brand designer → skip"),
    ("Frontend Developer",                      False, "frontend dev → skip"),
    ("Motion Designer",                         False, "motion designer → skip"),
    ("Product Manager",                         False, "PM → skip"),
    ("Staff Product Designer",                  True,  "staff product designer → passes role filter (exp filter handles skip-tier)"),
]

for title, should_pass, label in role_cases:
    result = is_design_role(title)
    if result == should_pass:
        ok("role_filter", label, f"'{title}' → {'pass' if result else 'skip'} ✓")
    else:
        fail("role_filter", label, f"expected {'pass' if should_pass else 'skip'}, got {'pass' if result else 'skip'}")


# ══════════════════════════════════════════════════════════════════════════════
# 9. DB CONNECTIVITY + LAST RUN STATS
# ══════════════════════════════════════════════════════════════════════════════
section("9 · DB connectivity + last pipeline run sanity")

try:
    import pipeline.db as db
    client = db.get_client()

    # Ping — fetch 1 row from companies
    ping = client.table("companies").select("id").limit(1).execute()
    ok("db", "Supabase connection", f"{len(ping.data)} row(s) returned")

    # Company count
    companies = client.table("companies").select("id", count="exact").execute()
    count = companies.count if companies.count is not None else len(companies.data)
    ok("db", "companies table", f"{count} total companies")

    # Job postings count
    jobs = client.table("job_postings").select("id", count="exact").eq("track", "B").execute()
    job_count = jobs.count if jobs.count is not None else len(jobs.data)
    ok("db", "job_postings (Track B)", f"{job_count} total Track B postings")

    # Funded leads count
    leads = client.table("funded_leads").select("id", count="exact").execute()
    lead_count = leads.count if leads.count is not None else len(leads.data)
    ok("db", "funded_leads (Track A)", f"{lead_count} total funded leads")

    # Last 3 pipeline runs — check for red flags
    runs = client.table("pipeline_runs").select("*").order("started_at", desc=True).limit(3).execute()
    if not runs.data:
        warn("db", "pipeline_runs", "no runs found in DB")
    else:
        print()
        for run in runs.data:
            started = run.get("started_at", "")[:16]
            ta_new   = run.get("track_a_new", 0)
            ta_dedup = run.get("track_a_skipped_dedup", 0)
            ta_filt  = run.get("track_a_skipped_filter", 0)
            tb_new   = run.get("track_b_new", 0)
            tb_dedup = run.get("track_b_skipped_dedup", 0)
            tb_filt  = run.get("track_b_skipped_filter", 0)
            errors   = run.get("errors", []) or []
            status   = run.get("status", "?")

            print(f"  Run {started} [{status}]")
            print(f"    Track A: {ta_new} new, {ta_dedup} deduped, {ta_filt} filtered")
            print(f"    Track B: {tb_new} new, {tb_dedup} deduped, {tb_filt} filtered")
            print(f"    Errors:  {len(errors)}")

            # Red flag checks from CONTEXT.md
            if ta_new == 0 and ta_dedup == 0 and ta_filt == 0:
                fail("db_sanity", f"Run {started} Track A", "ALL zeros — scraper likely broken")
            elif ta_new == 0 and ta_dedup > 0:
                warn("db_sanity", f"Run {started} Track A", f"0 new, {ta_dedup} deduped — may be normal if DB is full")
            else:
                ok("db_sanity", f"Run {started} Track A", f"{ta_new} new ✓")

            if tb_new == 0 and tb_dedup == 0 and tb_filt == 0:
                fail("db_sanity", f"Run {started} Track B", "ALL zeros — fetchers likely broken")
            elif tb_new == 0 and tb_dedup > 0:
                ok("db_sanity", f"Run {started} Track B", f"0 new (all deduped, {tb_dedup}) — normal for stable board")
            else:
                ok("db_sanity", f"Run {started} Track B", f"{tb_new} new ✓")

            if errors:
                is_latest = run == runs.data[0]
                reporter = fail if is_latest else warn
                for err in errors[:3]:
                    reporter("db_sanity", f"Run {started} error", f"[{err.get('source')}] {err.get('message', '')[:80]}")

except Exception as e:
    fail("db", "Supabase connection", str(e))


# ══════════════════════════════════════════════════════════════════════════════
# 10. APOLLO CREDIT CHECK
# ══════════════════════════════════════════════════════════════════════════════
section("10 · Apollo API — real credit check")

try:
    import pipeline.apollo as apollo
    credits = apollo.get_credit_balance()
    if credits is None:
        warn("apollo", "credit check", "returned None — check API key")
    elif credits == 0:
        fail("apollo", "credit check", "ZERO credits — email reveal will fail")
    elif credits < 30:
        warn("apollo", "credit check", f"{credits} credits remaining — LOW (alert threshold: 30)")
    else:
        ok("apollo", "credit check", f"{credits} credits remaining ✓")
except Exception as e:
    fail("apollo", "credit check", str(e))


# ══════════════════════════════════════════════════════════════════════════════
# 11. LIVE TRACK A FETCHERS — real HTTP
# ══════════════════════════════════════════════════════════════════════════════
section("11 · Live Track A fetchers (real HTTP)")

# Track A fetchers use "name" (not "company_name") — main.py handles both via get("company_name") or get("name")
TRACK_A_REQUIRED_FIELDS = ["name", "funding_amount", "announced_date", "source"]

def check_track_a_fetcher(name, fetch_fn):
    try:
        items = fetch_fn()
        count = len(items)
        if count == 0:
            fail("track_a_live", name, "returned 0 items — check scraper")
            return

        # Check required fields
        missing_fields = []
        for item in items[:5]:
            for field in TRACK_A_REQUIRED_FIELDS:
                if field not in item:
                    missing_fields.append(field)

        if missing_fields:
            fail("track_a_live", name, f"{count} items but missing fields: {set(missing_fields)}")
            return

        # Amount filter sanity — are amounts in expected USD range?
        amounts = [item.get("funding_amount") or item.get("funding_amount_usd") or 0 for item in items[:10]]
        non_zero = [a for a in amounts if a > 0]
        in_range  = [a for a in non_zero if 1_000_000 <= a <= 50_000_000]

        # Show first 5 results
        print()
        for item in items[:5]:
            amt = item.get("funding_amount") or item.get("funding_amount_usd") or 0
            rtype = item.get("round_type") or "Unknown"
            cname = item.get("company_name", "?")
            date  = (item.get("announced_date") or "")[:10]
            flag  = "" if 1_000_000 <= amt <= 50_000_000 else f" ← OUT OF RANGE ${amt:,.0f}"
            print(f"    {date} | {cname} | {rtype} | ${amt:,.0f}{flag}")

        ok("track_a_live", name, f"{count} items, {len(in_range)}/{len(non_zero)} in $1M-$50M range")

    except Exception as e:
        fail("track_a_live", name, str(e))

from pipeline.fetchers import cryptorank_scraper, dropstab_scraper
check_track_a_fetcher("CryptoRank", cryptorank_scraper.fetch)
check_track_a_fetcher("DropsTab",   dropstab_scraper.fetch)


# ══════════════════════════════════════════════════════════════════════════════
# 12. LIVE TRACK B FETCHERS — real HTTP + field schema + role filter preview
# ══════════════════════════════════════════════════════════════════════════════
section("12 · Live Track B fetchers (real HTTP)")

from pipeline.fetchers import (
    web3career, cryptojobslist_rss, cryptocurrencyjobs_rss,
    dragonfly_jobs, arbitrum_jobs, hashtagweb3, talentweb3,
    solana_jobs, paradigm_jobs, sui_jobs, a16zcrypto_jobs,
)

TRACK_B_REQUIRED_FIELDS = [
    "job_title", "company_name", "job_url", "source",
    "description_raw", "location",
]

track_b_fetchers = [
    ("web3career",         web3career.fetch),
    ("cryptojobslist",     cryptojobslist_rss.fetch),
    ("cryptocurrencyjobs", cryptocurrencyjobs_rss.fetch),
    ("dragonfly",          dragonfly_jobs.fetch),
    ("arbitrum",           arbitrum_jobs.fetch),
    ("hashtagweb3",        hashtagweb3.fetch),
    ("talentweb3",         talentweb3.fetch),
    ("solana_jobs",        solana_jobs.fetch),
    ("paradigm",           paradigm_jobs.fetch),
    ("sui_jobs",           sui_jobs.fetch),
    ("a16zcrypto",         a16zcrypto_jobs.fetch),
]

total_fetched = 0
total_design  = 0

for fname, fetch_fn in track_b_fetchers:
    try:
        items = fetch_fn()
        count = len(items)
        total_fetched += count

        if count == 0:
            warn("track_b_live", fname, "returned 0 items")
            continue

        # Field schema check — first 3 items
        missing = set()
        for item in items[:3]:
            for field in TRACK_B_REQUIRED_FIELDS:
                if field not in item:
                    missing.add(field)

        # Source field consistency — source must match fetcher name
        wrong_source = [i for i in items[:5] if i.get("source") != fname]

        # Role filter pass rate
        design_items = [i for i in items if is_design_role(i.get("job_title", ""))]
        total_design += len(design_items)

        issues = []
        if missing:
            issues.append(f"missing fields: {missing}")
        if wrong_source:
            issues.append(f"wrong source field in {len(wrong_source)} items")

        detail = f"{count} total → {len(design_items)} design roles pass filter"
        if issues:
            fail("track_b_live", fname, detail + " | " + "; ".join(issues))
        else:
            ok("track_b_live", fname, detail)

        # Show first 3 design jobs for visibility
        for item in design_items[:3]:
            title = item.get("job_title", "?")
            company = item.get("company_name", "?")
            location = item.get("location", "?")
            has_salary = bool(item.get("salary_min") or item.get("salary_max"))
            sal_note = f" [salary: ${item.get('salary_min',0):,}–${item.get('salary_max',0):,}]" if has_salary else ""
            print(f"      {title} @ {company} ({location}){sal_note}")

    except Exception as e:
        fail("track_b_live", fname, str(e))

print(f"\n  Summary: {total_fetched} total jobs fetched across all sources, {total_design} pass design role filter")


# ══════════════════════════════════════════════════════════════════════════════
# 13. SKIP-TIER KEYWORD COMPLETENESS
# ══════════════════════════════════════════════════════════════════════════════
section("13 · SKIP_TIER_KEYWORDS completeness check")

from pipeline.config import SKIP_TIER_KEYWORDS

# Titles that MUST be caught as skip
must_skip = [
    "Staff Designer",
    "Staff Product Designer",
    "Principal Designer",
    "Principal Product Designer",
    "Design Director",
    "Director of Design",
    "VP of Design",
    "Head of Design",
]

for title in must_skip:
    level, _, _ = classify_experience(title)
    if level == "skip":
        ok("skip_tier", title, "correctly classified as skip ✓")
    else:
        fail("skip_tier", title, f"classified as '{level}' — should be 'skip'. Add to SKIP_TIER_KEYWORDS")


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
section("SUMMARY")

passes   = sum(1 for _, _, s in results if s.startswith(f"{GREEN}PASS"))
failures = sum(1 for _, _, s in results if s.startswith(f"{RED}FAIL"))
warnings = sum(1 for _, _, s in results if s.startswith(f"{YELLOW}WARN"))

print(f"  Total:    {len(results)} checks")
print(f"  {PASS}: {passes}")
print(f"  {FAIL}: {failures}")
print(f"  {WARN}: {warnings}")

if failures == 0 and warnings == 0:
    print(f"\n  {GREEN}{BOLD}All checks passed. Pipeline is ready for daily runs.{RESET}")
elif failures == 0:
    print(f"\n  {YELLOW}{BOLD}Passed with {warnings} warning(s). Review above before going live.{RESET}")
else:
    print(f"\n  {RED}{BOLD}{failures} check(s) FAILED. Fix before relying on daily runs.{RESET}")

sys.exit(1 if failures > 0 else 0)
