"""
Pipeline orchestrator.
Runs daily via GitHub Actions at 8:00 AM IST (2:30 UTC).

Execution order:
  1. Start pipeline_run record
  2. Check Apollo credits
  3. Track A: fetch → dedup → enrich → save
  4. Track B: fetch → filter → dedup → enrich → save
  5. Generate follow-up messages for 7-day-old records
  6. Update Apollo credit balance
  7. Complete pipeline_run record
"""
import sys
import json
import traceback
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse

import pipeline.db as db
import pipeline.apollo as apollo
import pipeline.hunter as hunter
import pipeline.generator as gen

from pipeline.dedup.matcher import find_company_match, normalize_domain
from pipeline.filters.experience import classify_experience
from pipeline.filters.remote_scope import detect_remote_scope
from pipeline.enrichment.twitter_finder import find_twitter_handle
from pipeline.enrichment.exa_finder import find_company_linkedin, find_company_domain, hunter_enrich_company
from pipeline.config import (
    DESIGN_ROLE_KEYWORDS, FUNDING_MIN_USD, FUNDING_MAX_USD, NINETY_DAY_RESET, GEMINI_ENABLED,
    CLEANUP_DAYS,
)

from pipeline.filters.visa_check import check_visa_sponsorship

from pipeline.fetchers import (
    cryptorank_scraper,
    web3career, cryptojobslist_rss, cryptocurrencyjobs_rss,
    dragonfly_jobs, arbitrum_jobs, hashtagweb3, talentweb3,
    remotive, himalayas, weworkremotely_rss, yc_startups,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

class Stats:
    def __init__(self):
        self.track_a_new             = 0
        self.track_a_skipped_dedup   = 0
        self.track_a_skipped_filter  = 0
        self.track_b_new             = 0
        self.track_b_skipped_dedup   = 0
        self.track_b_skipped_filter  = 0
        self.track_c_new             = 0
        self.track_c_skipped_dedup   = 0
        self.track_c_skipped_filter  = 0
        self.errors: list[dict]      = []

    def add_error(self, source: str, message: str):
        self.errors.append({
            "source":    source,
            "message":   message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        print(f"[ERROR] {source}: {message}")

    def to_dict(self) -> dict:
        return {
            "track_a_new":            self.track_a_new,
            "track_a_skipped_dedup":  self.track_a_skipped_dedup,
            "track_a_skipped_filter": self.track_a_skipped_filter,
            "track_b_new":            self.track_b_new,
            "track_b_skipped_dedup":  self.track_b_skipped_dedup,
            "track_b_skipped_filter": self.track_b_skipped_filter,
            "track_c_new":            self.track_c_new,
            "track_c_skipped_dedup":  self.track_c_skipped_dedup,
            "track_c_skipped_filter": self.track_c_skipped_filter,
            "errors":                 self.errors,
        }


def is_design_role(job: dict) -> bool:
    title = job.get("job_title", "").lower()
    return any(kw in title for kw in DESIGN_ROLE_KEYWORDS)


# ── Track A processing ────────────────────────────────────────────────────────

def process_funded_company(company_data: dict, existing_companies: list[dict], stats: Stats):
    """Process one funded company through dedup → enrich → save."""
    name   = company_data.get("company_name") or company_data.get("name", "")
    url    = company_data.get("company_website") or company_data.get("website", "")
    domain = normalize_domain(url)

    # Amount filter (for RSS-sourced companies, check amount again)
    amount = float(company_data.get("funding_amount_usd") or company_data.get("funding_amount") or 0)
    if amount and not (FUNDING_MIN_USD <= amount <= FUNDING_MAX_USD):
        stats.track_a_skipped_filter += 1
        return

    round_type = company_data.get("round_type")
    if round_type not in ("Pre-Seed", "Seed", "Series A", "Series B"):
        stats.track_a_skipped_filter += 1
        return

    # Dedup
    existing_id = find_company_match(name, domain, existing_companies)
    if existing_id:
        recent = db.get_recent_funded_lead(existing_id, days=NINETY_DAY_RESET)
        if recent:
            stats.track_a_skipped_dedup += 1
            return

    # Upsert company
    company_row = {
        "name":         name,
        "domain":       domain or None,
        "website":      url or None,
        "linkedin_url": company_data.get("linkedin_url") or None,
    }
    company_id = db.upsert_company(company_row)

    # Add to in-memory list so later iterations benefit from dedup
    existing_companies.append({"id": company_id, "name": name, "domain": domain})

    # Apollo → Hunter fallback: find contact
    contact_id    = None
    contact_name  = ""
    contact_title = ""
    try:
        try:
            contact_data = apollo.find_contact(name, domain, None)
        except Exception as apollo_err:
            print(f"[Apollo] Error finding contact, trying Hunter: {apollo_err}")
            contact_data = None
        if not contact_data:
            contact_data = hunter.find_contact(name, domain, None)
            if contact_data:
                print(f"[Hunter] Found contact via fallback: {contact_data.get('name')}")

        if contact_data:
            # Enrich company record with org data
            org_update = {}
            if contact_data.get("org_website"):
                org_update["website"] = contact_data["org_website"]
            if contact_data.get("org_linkedin"):
                org_update["linkedin_url"] = contact_data["org_linkedin"]
            if org_update:
                db.update_company(company_id, org_update)

            apollo_id = contact_data.get("apollo_person_id")
            existing_contact = db.get_contact_by_apollo_id(apollo_id) if apollo_id else None
            if existing_contact:
                contact_id = existing_contact["id"]
            else:
                # Strip internal/org keys before inserting
                skip = {k for k in contact_data if k.startswith("org_") or k.startswith("_hunter_")}
                contact_insert = {k: v for k, v in contact_data.items() if k not in skip}
                # If Hunter domain search returned email directly, use it
                hunter_email = contact_data.get("_hunter_email")
                if hunter_email:
                    contact_insert["email"] = hunter_email
                    contact_insert["email_revealed"] = True
                # Twitter: use Hunter's value if present, otherwise search Exa/Tavily/Brave
                if contact_insert.get("twitter_url"):
                    contact_insert["twitter_confidence"] = "high"
                    print(f"[Twitter] From Hunter: {contact_insert['twitter_url']}")
                else:
                    try:
                        twitter_url, twitter_confidence = find_twitter_handle(contact_data.get("name", ""), name)
                        if twitter_url:
                            contact_insert["twitter_url"] = twitter_url
                            contact_insert["twitter_confidence"] = twitter_confidence
                            print(f"[Twitter] Found ({twitter_confidence}): {twitter_url}")
                    except Exception:
                        pass
                contact_id = db.insert_contact({**contact_insert, "company_id": company_id})
            contact_name  = contact_data.get("name", "")
            contact_title = contact_data.get("title", "")
    except Exception as e:
        stats.add_error("apollo_track_a", str(e))

    # Company social enrichment — Apollo org enrich (free) → Exa/Tavily fallback
    try:
        company_row_current = db.get_company(company_id)
        needs_linkedin = not (company_row_current or {}).get("linkedin_url")
        if needs_linkedin and domain:
            apollo_org = apollo.enrich_company(domain)
            org_update = {}
            if apollo_org.get("linkedin_url"):
                org_update["linkedin_url"] = apollo_org["linkedin_url"]
                print(f"[Apollo] Company LinkedIn: {apollo_org['linkedin_url']}")
            if apollo_org.get("employee_count") and not (company_row_current or {}).get("employee_count"):
                org_update["employee_count"] = apollo_org["employee_count"]
            if org_update:
                db.update_company(company_id, org_update)
            elif needs_linkedin:
                linkedin = find_company_linkedin(name, domain or "")
                if linkedin:
                    db.update_company(company_id, {"linkedin_url": linkedin})
                    print(f"[Exa] Company LinkedIn: {linkedin}")
    except Exception:
        pass

    # Gemini: generate content (skipped if disabled)
    linkedin_note = None
    email_draft   = None
    description   = None
    if GEMINI_ENABLED:
        try:
            result = gen.generate_funded_company_content(
                company_name    = name,
                website         = url,
                funding_amount  = amount or 0,
                round_type      = round_type,
            )
            description   = result.get("summary")
            linkedin_note = result.get("linkedin_note")
            email_draft   = (
                f"Subject: {result.get('email_subject', '')}\n\n"
                f"{result.get('email_body', '')}"
            )
            db.upsert_company({"name": name, "domain": domain, "description": description})
        except Exception as e:
            stats.add_error("gemini_track_a", str(e))

    # Save funded lead
    db.insert_funded_lead({
        "company_id":       company_id,
        "contact_id":       contact_id,
        "source":           company_data.get("source", ""),
        "funding_amount":   amount or None,
        "funding_currency": company_data.get("funding_currency", "USD"),
        "round_type":       round_type,
        "announced_date":   company_data.get("announced_date") or company_data.get("published_date"),
        "linkedin_note":    linkedin_note,
        "email_draft":      email_draft,
        "raw_data":         company_data.get("raw_data"),
    })
    stats.track_a_new += 1
    print(f"[Track A] Saved: {name} ({round_type})")


# ── Track B processing ────────────────────────────────────────────────────────

def normalize_job_url(url: str) -> str:
    """Strip UTM/tracking query params so the same job URL isn't inserted twice."""
    if not url:
        return url
    parsed = urlparse(url)
    return urlunparse(parsed._replace(query="", fragment=""))


def process_job_posting(job: dict, existing_companies: list[dict], stats: Stats):
    """Process one job posting through filter → dedup → enrich → save."""

    # Normalize URL before dedup (strips UTM params)
    job["job_url"] = normalize_job_url(job["job_url"])

    # URL dedup (fastest check first — skip if URL is empty to avoid false matches)
    if job["job_url"] and db.get_job_by_url(job["job_url"]):
        stats.track_b_skipped_dedup += 1
        return

    # Experience classification
    exp_match, years_min, years_max = classify_experience(
        job.get("description_raw", "") + " " + job.get("job_title", "")
    )
    if exp_match == "skip":
        stats.track_b_skipped_filter += 1
        return
    needs_exp_groq = exp_match == "ambiguous"

    # Remote scope
    remote_scope = detect_remote_scope(
        job.get("description_raw", ""),
        job.get("location", ""),
    )
    needs_remote_groq = remote_scope == "unclear"

    # Company dedup
    name   = job.get("company_name", "")
    url    = job.get("company_website", "")
    domain = normalize_domain(url)

    existing_id = find_company_match(name, domain, existing_companies)
    if existing_id:
        company_id = existing_id
        # Secondary dedup: same company + same title (catches same job listed with different URLs)
        if db.get_job_by_company_title(company_id, job["job_title"]):
            stats.track_b_skipped_dedup += 1
            return
    else:
        company_id = db.upsert_company({
            "name":    name,
            "domain":  domain or None,
            "website": url or None,
        })
        existing_companies.append({"id": company_id, "name": name, "domain": domain})

    # Domain discovery — if fetcher gave no website, find it via Exa/Tavily
    if not domain and name:
        try:
            discovered = find_company_domain(name)
            if discovered:
                domain = discovered
                db.update_company(company_id, {"domain": domain, "website": f"https://{domain}"})
                print(f"[Domain] Discovered for {name}: {domain}")
        except Exception:
            pass

    # Hunter company enrichment — FREE, no credits, gets LinkedIn + Twitter from domain
    if domain:
        try:
            company_row_current = db.get_company(company_id)
            needs_linkedin = not (company_row_current or {}).get("linkedin_url")
            if needs_linkedin:
                enriched = hunter_enrich_company(domain, name)
                update = {}
                if enriched.get("linkedin"):
                    update["linkedin_url"] = enriched["linkedin"]
                if update:
                    db.update_company(company_id, update)
                    print(f"[Hunter] Company enriched for {name}: {update}")
        except Exception:
            pass

    # Apollo → Hunter fallback: find contact
    # Skip for recruiter/aggregator sources where company_name is the platform, not the hiring co
    contact_id    = None
    contact_name  = ""
    contact_title = ""
    skip_contact  = job.get("source") == "talentweb3"
    try:
        contact_data = None
        if not skip_contact:
            try:
                contact_data = apollo.find_contact(name, domain, None)
            except Exception as apollo_err:
                print(f"[Apollo] Error finding contact, trying Hunter: {apollo_err}")
                contact_data = None
            if not contact_data:
                contact_data = hunter.find_contact(name, domain, None)
                if contact_data:
                    print(f"[Hunter] Found contact via fallback: {contact_data.get('name')}")

        if contact_data:
            # Enrich company record with org data
            org_update = {}
            if contact_data.get("org_website"):
                org_update["website"] = contact_data["org_website"]
            if contact_data.get("org_linkedin"):
                org_update["linkedin_url"] = contact_data["org_linkedin"]
            if org_update:
                db.update_company(company_id, org_update)

            apollo_id = contact_data.get("apollo_person_id")
            existing_contact = db.get_contact_by_apollo_id(apollo_id) if apollo_id else None
            if existing_contact:
                contact_id = existing_contact["id"]
            else:
                # Strip internal/org keys before inserting
                skip = {k for k in contact_data if k.startswith("org_") or k.startswith("_hunter_")}
                contact_insert = {k: v for k, v in contact_data.items() if k not in skip}
                # If Hunter domain search returned email directly, use it
                hunter_email = contact_data.get("_hunter_email")
                if hunter_email:
                    contact_insert["email"] = hunter_email
                    contact_insert["email_revealed"] = True
                # Twitter: use Hunter's value if present, otherwise search Exa/Tavily/Brave
                if contact_insert.get("twitter_url"):
                    contact_insert["twitter_confidence"] = "high"
                    print(f"[Twitter] From Hunter: {contact_insert['twitter_url']}")
                else:
                    try:
                        twitter_url, twitter_confidence = find_twitter_handle(contact_data.get("name", ""), name)
                        if twitter_url:
                            contact_insert["twitter_url"] = twitter_url
                            contact_insert["twitter_confidence"] = twitter_confidence
                            print(f"[Twitter] Found ({twitter_confidence}): {twitter_url}")
                    except Exception:
                        pass
                contact_id = db.insert_contact({**contact_insert, "company_id": company_id})
            contact_name  = contact_data.get("name", "")
            contact_title = contact_data.get("title", "")
    except Exception as e:
        stats.add_error("apollo_track_b", str(e))

    # Company social enrichment — Apollo org enrich (free) → Exa/Tavily fallback
    try:
        company_row_current = db.get_company(company_id)
        needs_linkedin = not (company_row_current or {}).get("linkedin_url")
        if needs_linkedin and domain:
            # Step 1: Apollo /organizations/enrich (free, most accurate)
            apollo_org = apollo.enrich_company(domain)
            org_update = {}
            if apollo_org.get("linkedin_url"):
                org_update["linkedin_url"] = apollo_org["linkedin_url"]
                print(f"[Apollo] Company LinkedIn: {apollo_org['linkedin_url']}")
            if apollo_org.get("employee_count") and not (company_row_current or {}).get("employee_count"):
                org_update["employee_count"] = apollo_org["employee_count"]
            if org_update:
                db.update_company(company_id, org_update)
            # Step 2: Exa/Tavily fallback if Apollo found nothing
            elif needs_linkedin:
                linkedin = find_company_linkedin(name, domain)
                if linkedin:
                    db.update_company(company_id, {"linkedin_url": linkedin})
                    print(f"[Exa] Company LinkedIn: {linkedin}")
    except Exception:
        pass

    # Gemini: generate summary and classifications in one call (skipped if disabled)
    description_summary = None
    cover_letter        = None # No longer generated in pipeline
    linkedin_note       = None # No longer generated in pipeline
    email_draft         = None # No longer generated in pipeline
    groq_exp_match      = exp_match if not needs_exp_groq else "strong"  # fallback
    groq_remote_scope   = remote_scope if not needs_remote_groq else "unclear"

    if GEMINI_ENABLED:
        try:
            result = gen.generate_job_content(
                job_title      = job["job_title"],
                company_name   = name,
                description    = job.get("description_raw", ""),
                needs_experience_classification = needs_exp_groq,
                needs_remote_classification     = needs_remote_groq,
                contact_name   = contact_name,
                contact_title  = contact_title,
            )
            description_summary = json.dumps({
                "location":     result.get("location"),
                "salary":       result.get("salary"),
                "requirements": result.get("requirements_bullets", []),
            })
            
            if needs_exp_groq and result.get("experience_match"):
                groq_exp_match = result["experience_match"]
                if groq_exp_match == "skip":
                    stats.track_b_skipped_filter += 1
                    return
            if needs_remote_groq and result.get("remote_scope"):
                groq_remote_scope = result["remote_scope"]
        except Exception as e:
            stats.add_error("gemini_track_b", str(e))

    # Save job posting
    db.insert_job_posting({
        "company_id":          company_id,
        "contact_id":          contact_id,
        "source":              job["source"],
        "job_title":           job["job_title"],
        "job_url":             job["job_url"],
        "description_raw":     job.get("description_raw"),
        "description_summary": description_summary,
        "salary_min":          job.get("salary_min"),
        "salary_max":          job.get("salary_max"),
        "salary_currency":     job.get("salary_currency", "USD"),
        "posted_at":           job.get("posted_at"),
        "location":            job.get("location"),
        "remote_scope":        groq_remote_scope,
        "experience_match":    groq_exp_match if groq_exp_match != "ambiguous" else "strong",
        "years_min":           years_min,
        "years_max":           years_max,
        "cover_letter":        cover_letter,
        "linkedin_note":       linkedin_note,
        "email_draft":         email_draft,
        "raw_data":            job.get("raw_data"),
    })
    stats.track_b_new += 1
    print(f"[Track B] Saved: {job['job_title']} at {name}")


# ── Track C processing ────────────────────────────────────────────────────────

def process_general_job(job: dict, existing_companies: list[dict], stats: Stats):
    """Process one Track C (general design) job posting.

    Differences from process_job_posting():
    - No crypto keyword check (caller handles role keyword filter)
    - Rejects us_only remote scope (hard skip, not just a flag)
    - Runs visa sponsorship check → stored as visa_sponsorship flag
    - Saves with track='C'
    """

    # Normalize URL before dedup
    job["job_url"] = normalize_job_url(job["job_url"])

    # URL dedup
    if job["job_url"] and db.get_job_by_url(job["job_url"]):
        stats.track_c_skipped_dedup += 1
        return

    # Experience classification
    exp_match, years_min, years_max = classify_experience(
        job.get("description_raw", "") + " " + job.get("job_title", "")
    )
    if exp_match == "skip":
        stats.track_c_skipped_filter += 1
        return
    needs_exp_groq = exp_match == "ambiguous"

    # Remote scope — strict: reject us_only entirely
    remote_scope = detect_remote_scope(
        job.get("description_raw", ""),
        job.get("location", ""),
    )
    if remote_scope == "us_only":
        stats.track_c_skipped_filter += 1
        return
    needs_remote_groq = remote_scope == "unclear"

    # Visa sponsorship flag
    visa_sponsorship = check_visa_sponsorship(job.get("description_raw", ""))

    # Company dedup
    name   = job.get("company_name", "")
    url    = job.get("company_website", "")
    domain = normalize_domain(url)

    existing_id = find_company_match(name, domain, existing_companies)
    if existing_id:
        company_id = existing_id
        if db.get_job_by_company_title(company_id, job["job_title"]):
            stats.track_c_skipped_dedup += 1
            return
    else:
        company_id = db.upsert_company({
            "name":    name,
            "domain":  domain or None,
            "website": url or None,
        })
        existing_companies.append({"id": company_id, "name": name, "domain": domain})

    # Domain discovery
    if not domain and name:
        try:
            discovered = find_company_domain(name)
            if discovered:
                domain = discovered
                db.update_company(company_id, {"domain": domain, "website": f"https://{domain}"})
                print(f"[Domain] Discovered for {name}: {domain}")
        except Exception:
            pass

    # Hunter company enrichment (free — LinkedIn from domain)
    if domain:
        try:
            company_row_current = db.get_company(company_id)
            if not (company_row_current or {}).get("linkedin_url"):
                enriched = hunter_enrich_company(domain, name)
                update = {}
                if enriched.get("linkedin"):
                    update["linkedin_url"] = enriched["linkedin"]
                if update:
                    db.update_company(company_id, update)
                    print(f"[Hunter] Company enriched for {name}: {update}")
        except Exception:
            pass

    # Apollo → Hunter: find contact
    contact_id    = None
    contact_name  = ""
    contact_title = ""
    try:
        contact_data = None
        try:
            contact_data = apollo.find_contact(name, domain, None)
        except Exception as apollo_err:
            print(f"[Apollo] Error finding contact, trying Hunter: {apollo_err}")
            contact_data = None
        if not contact_data:
            contact_data = hunter.find_contact(name, domain, None)
            if contact_data:
                print(f"[Hunter] Found contact via fallback: {contact_data.get('name')}")

        if contact_data:
            org_update = {}
            if contact_data.get("org_website"):
                org_update["website"] = contact_data["org_website"]
            if contact_data.get("org_linkedin"):
                org_update["linkedin_url"] = contact_data["org_linkedin"]
            if org_update:
                db.update_company(company_id, org_update)

            apollo_id = contact_data.get("apollo_person_id")
            existing_contact = db.get_contact_by_apollo_id(apollo_id) if apollo_id else None
            if existing_contact:
                contact_id = existing_contact["id"]
            else:
                skip = {k for k in contact_data if k.startswith("org_") or k.startswith("_hunter_")}
                contact_insert = {k: v for k, v in contact_data.items() if k not in skip}
                hunter_email = contact_data.get("_hunter_email")
                if hunter_email:
                    contact_insert["email"] = hunter_email
                    contact_insert["email_revealed"] = True
                if contact_insert.get("twitter_url"):
                    contact_insert["twitter_confidence"] = "high"
                    print(f"[Twitter] From Hunter: {contact_insert['twitter_url']}")
                else:
                    try:
                        twitter_url, twitter_confidence = find_twitter_handle(contact_data.get("name", ""), name)
                        if twitter_url:
                            contact_insert["twitter_url"] = twitter_url
                            contact_insert["twitter_confidence"] = twitter_confidence
                            print(f"[Twitter] Found ({twitter_confidence}): {twitter_url}")
                    except Exception:
                        pass
                contact_id = db.insert_contact({**contact_insert, "company_id": company_id})
            contact_name  = contact_data.get("name", "")
            contact_title = contact_data.get("title", "")
    except Exception as e:
        stats.add_error("apollo_track_c", str(e))

    # Company LinkedIn enrichment — Apollo (free) → Exa/Tavily fallback
    try:
        company_row_current = db.get_company(company_id)
        needs_linkedin = not (company_row_current or {}).get("linkedin_url")
        if needs_linkedin and domain:
            apollo_org = apollo.enrich_company(domain)
            org_update = {}
            if apollo_org.get("linkedin_url"):
                org_update["linkedin_url"] = apollo_org["linkedin_url"]
                print(f"[Apollo] Company LinkedIn: {apollo_org['linkedin_url']}")
            if apollo_org.get("employee_count") and not (company_row_current or {}).get("employee_count"):
                org_update["employee_count"] = apollo_org["employee_count"]
            if org_update:
                db.update_company(company_id, org_update)
            elif needs_linkedin:
                linkedin = find_company_linkedin(name, domain)
                if linkedin:
                    db.update_company(company_id, {"linkedin_url": linkedin})
                    print(f"[Exa] Company LinkedIn: {linkedin}")
    except Exception:
        pass

    # Gemini: generate summary and classifications
    description_summary = None
    groq_exp_match    = exp_match if not needs_exp_groq else "strong"
    groq_remote_scope = remote_scope if not needs_remote_groq else "unclear"

    if GEMINI_ENABLED:
        try:
            result = gen.generate_job_content(
                job_title      = job["job_title"],
                company_name   = name,
                description    = job.get("description_raw", ""),
                needs_experience_classification = needs_exp_groq,
                needs_remote_classification     = needs_remote_groq,
                contact_name   = contact_name,
                contact_title  = contact_title,
            )
            description_summary = json.dumps({
                "location":     result.get("location"),
                "salary":       result.get("salary"),
                "requirements": result.get("requirements_bullets", []),
            })
            if needs_exp_groq and result.get("experience_match"):
                groq_exp_match = result["experience_match"]
                if groq_exp_match == "skip":
                    stats.track_c_skipped_filter += 1
                    return
            if needs_remote_groq and result.get("remote_scope"):
                groq_remote_scope = result["remote_scope"]
                if groq_remote_scope == "us_only":
                    stats.track_c_skipped_filter += 1
                    return
        except Exception as e:
            stats.add_error("gemini_track_c", str(e))

    # Save job posting with track='C'
    db.insert_job_posting({
        "company_id":          company_id,
        "contact_id":          contact_id,
        "source":              job["source"],
        "job_title":           job["job_title"],
        "job_url":             job["job_url"],
        "description_raw":     job.get("description_raw"),
        "description_summary": description_summary,
        "salary_min":          job.get("salary_min"),
        "salary_max":          job.get("salary_max"),
        "salary_currency":     job.get("salary_currency", "USD"),
        "posted_at":           job.get("posted_at"),
        "location":            job.get("location"),
        "remote_scope":        groq_remote_scope,
        "experience_match":    groq_exp_match if groq_exp_match != "ambiguous" else "strong",
        "years_min":           years_min,
        "years_max":           years_max,
        "cover_letter":        None,
        "linkedin_note":       None,
        "email_draft":         None,
        "raw_data":            job.get("raw_data"),
        "track":               "C",
        "visa_sponsorship":    visa_sponsorship,
    })
    stats.track_c_new += 1
    print(f"[Track C] Saved: {job['job_title']} at {name}{' [visa]' if visa_sponsorship else ''}")


# ── Follow-up generation ──────────────────────────────────────────────────────

def generate_followups(stats: Stats):
    """Generate follow-up messages for records that are 7+ days old."""
    if not GEMINI_ENABLED:
        return

    # Funded leads
    leads = db.get_funded_leads_needing_followup(days=7)
    for lead in leads:
        try:
            company = db.get_client().table("companies").select("name").eq("id", lead["company_id"]).execute()
            company_name = company.data[0]["name"] if company.data else "the company"
            msg = gen.generate_followup(
                context_type     = "funded",
                company_name     = company_name,
                original_message = lead.get("linkedin_note", ""),
                days_since       = 7,
            )
            db.update_funded_lead(lead["id"], {
                "follow_up_message":   msg,
                "follow_up_generated": True,
            })
        except Exception as e:
            stats.add_error("followup_funded", str(e))

    # Job postings
    jobs = db.get_jobs_needing_followup(days=7)
    for job in jobs:
        try:
            company = db.get_client().table("companies").select("name").eq("id", job["company_id"]).execute()
            company_name = company.data[0]["name"] if company.data else "the company"
            msg = gen.generate_followup(
                context_type     = "job",
                company_name     = company_name,
                original_message = job.get("linkedin_note", ""),
                days_since       = 7,
            )
            db.update_job_posting(job["id"], {
                "follow_up_message":   msg,
                "follow_up_generated": True,
            })
        except Exception as e:
            stats.add_error("followup_jobs", str(e))

    print(f"[Follow-up] Processed {len(leads)} funded + {len(jobs)} job follow-ups")


# ── Main entry point ──────────────────────────────────────────────────────────

def main():
    print(f"[Pipeline] Starting at {datetime.now(timezone.utc).isoformat()}")
    run_id = db.start_pipeline_run()
    stats  = Stats()

    # Check Apollo credits before starting
    credits = apollo.get_credit_balance()
    if credits is not None and credits == 0:
        stats.add_error("apollo", "Credits exhausted — entire Apollo API unavailable")
        db.fail_pipeline_run(run_id, stats.errors)
        sys.exit(1)
    print(f"[Apollo] Credits remaining: {credits}")

    # Load all companies once for dedup (avoid N+1 queries)
    existing_companies = db.get_all_companies()
    print(f"[Dedup] Loaded {len(existing_companies)} existing companies")

    # ── Track A ───────────────────────────────────────────────────────────────
    print("[Track A] Starting funded company pipeline...")
    raw_funded = []

    # CryptoRank scraper — structured funding data, no API key needed
    try:
        items = cryptorank_scraper.fetch()
        print(f"[CryptoRank] Fetched {len(items)} matching rounds")
        raw_funded.extend(items)
    except Exception as e:
        stats.add_error("cryptorank_scraper", str(e))


    print(f"[Track A] Processing {len(raw_funded)} funded company candidates...")
    for item in raw_funded:
        try:
            process_funded_company(item, existing_companies, stats)
        except Exception as e:
            stats.add_error("track_a_process", str(e))

    # ── Track B ───────────────────────────────────────────────────────────────
    print("[Track B] Starting job postings pipeline...")
    raw_jobs = []

    track_b_fetchers = [
        ("web3career",          web3career.fetch),
        ("cryptojobslist",      cryptojobslist_rss.fetch),
        ("cryptocurrencyjobs",  cryptocurrencyjobs_rss.fetch),
        ("dragonfly",           dragonfly_jobs.fetch),
        ("arbitrum",            arbitrum_jobs.fetch),
        ("hashtagweb3",         hashtagweb3.fetch),
        ("talentweb3",          talentweb3.fetch),
    ]

    for name, fetcher_fn in track_b_fetchers:
        try:
            items = fetcher_fn()
            print(f"[{name}] Fetched {len(items)} items")
            raw_jobs.extend(items)
        except Exception as e:
            stats.add_error(name, str(e))

    # Role keyword filter — fast, no AI
    design_jobs = [j for j in raw_jobs if is_design_role(j)]
    skipped_role = len(raw_jobs) - len(design_jobs)
    print(f"[Track B] Role filter: {len(design_jobs)} design roles from {len(raw_jobs)} total ({skipped_role} skipped)")

    for job in design_jobs:
        try:
            process_job_posting(job, existing_companies, stats)
        except Exception as e:
            stats.add_error("track_b_process", str(e))

    # ── Track C ───────────────────────────────────────────────────────────────
    print("[Track C] Starting general design roles pipeline...")
    raw_general = []

    track_c_fetchers = [
        ("remotive",       remotive.fetch),
        ("himalayas",      himalayas.fetch),
        ("weworkremotely", weworkremotely_rss.fetch),
        ("yc_startups",    yc_startups.fetch),
    ]

    for name, fetcher_fn in track_c_fetchers:
        try:
            items = fetcher_fn()
            print(f"[{name}] Fetched {len(items)} items")
            raw_general.extend(items)
        except Exception as e:
            stats.add_error(name, str(e))

    # Role keyword filter (same DESIGN_ROLE_KEYWORDS as Track B)
    design_general = [j for j in raw_general if is_design_role(j)]
    skipped_role_c = len(raw_general) - len(design_general)
    print(f"[Track C] Role filter: {len(design_general)} design roles from {len(raw_general)} total ({skipped_role_c} skipped)")

    for job in design_general:
        try:
            process_general_job(job, existing_companies, stats)
        except Exception as e:
            stats.add_error("track_c_process", str(e))

    # ── Follow-ups ────────────────────────────────────────────────────────────
    generate_followups(stats)

    # ── Cleanup old untouched records ─────────────────────────────────────────
    try:
        cleaned = db.cleanup_old_records(days=CLEANUP_DAYS)
        print(f"[Cleanup] Deleted {cleaned['jobs_deleted']} old job postings, {cleaned['leads_deleted']} old funded leads")
    except Exception as e:
        stats.add_error("cleanup", str(e))

    # ── Apollo credit update ──────────────────────────────────────────────────
    final_credits = apollo.get_credit_balance()
    if final_credits is not None:
        db.set_setting("apollo_credits_remaining", str(final_credits))
        db.set_setting("apollo_credits_updated_at", datetime.now(timezone.utc).isoformat())
        if final_credits < 30:
            db.set_setting("apollo_credits_low_alert", "true")
            print(f"[Apollo] ⚠ LOW CREDITS: {final_credits} remaining")

    # ── Complete run ──────────────────────────────────────────────────────────
    db.complete_pipeline_run(run_id, stats.to_dict(), final_credits)
    print(f"""
[Pipeline] Complete.
  Track A: {stats.track_a_new} new, {stats.track_a_skipped_dedup} deduped, {stats.track_a_skipped_filter} filtered
  Track B: {stats.track_b_new} new, {stats.track_b_skipped_dedup} deduped, {stats.track_b_skipped_filter} filtered
  Track C: {stats.track_c_new} new, {stats.track_c_skipped_dedup} deduped, {stats.track_c_skipped_filter} filtered
  Errors:  {len(stats.errors)}
""")


if __name__ == "__main__":
    main()
