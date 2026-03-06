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
import traceback
from datetime import datetime, timezone

import pipeline.db as db
import pipeline.apollo as apollo
import pipeline.generator as gen

from pipeline.dedup.matcher import find_company_match, normalize_domain
from pipeline.filters.experience import classify_experience
from pipeline.filters.remote_scope import detect_remote_scope
from pipeline.config import (
    DESIGN_ROLE_KEYWORDS, FUNDING_MIN_USD, FUNDING_MAX_USD, NINETY_DAY_RESET
)

from pipeline.fetchers import (
    cryptorank, techcrunch_rss, eu_startups_rss,
    remoteok, remotive, wwr_rss, justjoinit, mycareers_sg, web3career,
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
        "name":   name,
        "domain": domain or None,
        "website": url or None,
    }
    company_id = db.upsert_company(company_row)

    # Add to in-memory list so later iterations benefit from dedup
    existing_companies.append({"id": company_id, "name": name, "domain": domain})

    # Apollo: find contact
    contact_id   = None
    contact_name = ""
    contact_title = ""
    try:
        contact_data = apollo.find_contact(name, domain, None)
        if contact_data and contact_data.get("apollo_person_id"):
            existing_contact = db.get_contact_by_apollo_id(contact_data["apollo_person_id"])
            if existing_contact:
                contact_id = existing_contact["id"]
            else:
                contact_id = db.insert_contact({**contact_data, "company_id": company_id})
            contact_name  = contact_data.get("name", "")
            contact_title = contact_data.get("title", "")
    except Exception as e:
        stats.add_error("apollo_track_a", str(e))

    # Groq: generate content
    linkedin_note = None
    email_draft   = None
    description   = None
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
        # Update company description
        db.upsert_company({"name": name, "domain": domain, "description": description})
    except Exception as e:
        stats.add_error("groq_track_a", str(e))

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

def process_job_posting(job: dict, existing_companies: list[dict], stats: Stats):
    """Process one job posting through filter → dedup → enrich → save."""

    # URL dedup (fastest check first)
    if db.get_job_by_url(job["job_url"]):
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
    else:
        company_id = db.upsert_company({
            "name":    name,
            "domain":  domain or None,
            "website": url or None,
        })
        existing_companies.append({"id": company_id, "name": name, "domain": domain})

    # Apollo: find contact
    contact_id    = None
    contact_name  = ""
    contact_title = ""
    try:
        contact_data = apollo.find_contact(name, domain, None)
        if contact_data and contact_data.get("apollo_person_id"):
            existing_contact = db.get_contact_by_apollo_id(contact_data["apollo_person_id"])
            if existing_contact:
                contact_id = existing_contact["id"]
            else:
                contact_id = db.insert_contact({**contact_data, "company_id": company_id})
            contact_name  = contact_data.get("name", "")
            contact_title = contact_data.get("title", "")
    except Exception as e:
        stats.add_error("apollo_track_b", str(e))

    # Groq: generate all content in one call
    description_summary = None
    cover_letter        = None
    linkedin_note       = None
    email_draft         = None
    groq_exp_match      = exp_match if not needs_exp_groq else "strong"  # fallback
    groq_remote_scope   = remote_scope if not needs_remote_groq else "unclear"

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
        description_summary = "\n".join(result.get("requirements_bullets", []))
        cover_letter        = result.get("cover_letter")
        linkedin_note       = result.get("linkedin_note")
        email_draft = (
            f"Subject: {result.get('email_subject', '')}\n\n"
            f"{result.get('email_body', '')}"
        )
        if needs_exp_groq and result.get("experience_match"):
            groq_exp_match = result["experience_match"]
            if groq_exp_match == "skip":
                stats.track_b_skipped_filter += 1
                return
        if needs_remote_groq and result.get("remote_scope"):
            groq_remote_scope = result["remote_scope"]
    except Exception as e:
        stats.add_error("groq_track_b", str(e))

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


# ── Follow-up generation ──────────────────────────────────────────────────────

def generate_followups(stats: Stats):
    """Generate follow-up messages for records that are 7+ days old."""

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

    # CryptoRank: structured data
    try:
        items = cryptorank.fetch()
        print(f"[CryptoRank] Fetched {len(items)} items")
        raw_funded.extend(items)
    except Exception as e:
        stats.add_error("cryptorank", str(e))

    # TechCrunch RSS → Groq extraction
    try:
        articles = techcrunch_rss.fetch()
        print(f"[TechCrunch] {len(articles)} funding articles to process")
        for article in articles:
            try:
                extracted = gen.extract_funding_from_article(
                    article["title"], article["summary"], "techcrunch"
                )
                if extracted:
                    extracted["announced_date"] = article["published_date"]
                    raw_funded.append(extracted)
            except Exception as e:
                stats.add_error("techcrunch_extract", str(e))
    except Exception as e:
        stats.add_error("techcrunch_rss", str(e))

    # EU-Startups RSS → Groq extraction
    try:
        articles = eu_startups_rss.fetch()
        print(f"[EU-Startups] {len(articles)} funding articles to process")
        for article in articles:
            try:
                extracted = gen.extract_funding_from_article(
                    article["title"], article["summary"], "eu_startups"
                )
                if extracted:
                    extracted["announced_date"] = article["published_date"]
                    raw_funded.append(extracted)
            except Exception as e:
                stats.add_error("eu_startups_extract", str(e))
    except Exception as e:
        stats.add_error("eu_startups_rss", str(e))

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
        ("remoteok",     remoteok.fetch),
        ("remotive",     remotive.fetch),
        ("wwr",          wwr_rss.fetch),
        ("justjoinit",   justjoinit.fetch),
        ("mycareers_sg", mycareers_sg.fetch),
        ("web3career",   web3career.fetch),
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

    # ── Follow-ups ────────────────────────────────────────────────────────────
    generate_followups(stats)

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
  Errors:  {len(stats.errors)}
""")


if __name__ == "__main__":
    main()
