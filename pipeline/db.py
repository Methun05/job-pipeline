"""
All Supabase database operations.
Uses service role key — bypasses RLS.
"""
import json
from datetime import datetime, timezone, timedelta
from typing import Optional
from supabase import create_client, Client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


# ── Pipeline runs ──────────────────────────────────────────────────────────────

def start_pipeline_run() -> str:
    res = get_client().table("pipeline_runs").insert({"status": "running"}).execute()
    return res.data[0]["id"]


def complete_pipeline_run(run_id: str, stats: dict, credits: Optional[int] = None):
    payload = {
        "status":                  "completed",
        "completed_at":            datetime.now(timezone.utc).isoformat(),
        "track_a_new":             stats.get("track_a_new", 0),
        "track_a_skipped_dedup":   stats.get("track_a_skipped_dedup", 0),
        "track_a_skipped_filter":  stats.get("track_a_skipped_filter", 0),
        "track_b_new":             stats.get("track_b_new", 0),
        "track_b_skipped_dedup":   stats.get("track_b_skipped_dedup", 0),
        "track_b_skipped_filter":  stats.get("track_b_skipped_filter", 0),
        "errors":                  stats.get("errors", []),
        "source_counts":           stats.get("source_counts", {}),
        "apollo_credits_remaining": credits,
    }
    try:
        get_client().table("pipeline_runs").update(payload).eq("id", run_id).execute()
    except Exception:
        # Fallback: save without source_counts in case migration hasn't run yet
        payload.pop("source_counts", None)
        get_client().table("pipeline_runs").update(payload).eq("id", run_id).execute()


def fail_pipeline_run(run_id: str, errors: list):
    get_client().table("pipeline_runs").update({
        "status":       "failed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "errors":       errors,
    }).eq("id", run_id).execute()


# ── Settings ───────────────────────────────────────────────────────────────────

def get_setting(key: str) -> Optional[str]:
    res = get_client().table("settings").select("value").eq("key", key).execute()
    return res.data[0]["value"] if res.data else None


def set_setting(key: str, value: str):
    get_client().table("settings").upsert({"key": key, "value": value}).execute()


# ── Companies ──────────────────────────────────────────────────────────────────

def get_all_companies() -> list[dict]:
    """Returns id, name, domain for fuzzy matching in Python."""
    res = get_client().table("companies").select("id,name,domain").execute()
    return res.data or []


def get_company_by_domain(domain: str) -> Optional[dict]:
    res = get_client().table("companies").select("*").eq("domain", domain).execute()
    return res.data[0] if res.data else None


def get_company(company_id: str) -> Optional[dict]:
    res = get_client().table("companies").select("*").eq("id", company_id).limit(1).execute()
    return res.data[0] if res.data else None


def update_company(company_id: str, data: dict):
    get_client().table("companies").update(data).eq("id", company_id).execute()


def get_company_by_name(name: str) -> Optional[dict]:
    res = get_client().table("companies").select("*").ilike("name", name).limit(1).execute()
    return res.data[0] if res.data else None


def upsert_company(data: dict) -> str:
    """Insert or update company. Returns company id."""
    domain = data.get("domain")
    # Try domain match first (most reliable)
    existing = get_company_by_domain(domain) if domain else None
    # Fall back to exact name match
    if not existing and data.get("name"):
        existing = get_company_by_name(data["name"])
    if existing:
        get_client().table("companies").update(data).eq("id", existing["id"]).execute()
        return existing["id"]
    res = get_client().table("companies").insert(data).execute()
    return res.data[0]["id"]


# ── Contacts ───────────────────────────────────────────────────────────────────

def get_contact_by_apollo_id(apollo_id: str) -> Optional[dict]:
    res = (get_client().table("contacts")
           .select("*").eq("apollo_person_id", apollo_id).execute())
    return res.data[0] if res.data else None


def insert_contact(data: dict) -> str:
    res = get_client().table("contacts").insert(data).execute()
    return res.data[0]["id"]


def update_contact_email(contact_id: str, email: str):
    get_client().table("contacts").update({
        "email":             email,
        "email_revealed":    True,
        "email_revealed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", contact_id).execute()


# ── Funded leads ───────────────────────────────────────────────────────────────

def get_recent_funded_lead(company_id: str, days: int = 90) -> Optional[dict]:
    """Check if company was contacted within N days (for 90-day reset logic)."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    res = (get_client().table("funded_leads")
           .select("id,status,created_at")
           .eq("company_id", company_id)
           .neq("status", "closed")
           .gte("created_at", cutoff)
           .execute())
    return res.data[0] if res.data else None


def insert_funded_lead(data: dict) -> str:
    res = get_client().table("funded_leads").insert(data).execute()
    return res.data[0]["id"]


def get_funded_leads_needing_followup(days: int = 7) -> list[dict]:
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    res = (get_client().table("funded_leads")
           .select("id,company_id,linkedin_note")
           .eq("status", "connection_sent")
           .eq("follow_up_generated", False)
           .lt("last_action_at", cutoff)
           .execute())
    return res.data or []


def update_funded_lead(lead_id: str, data: dict):
    get_client().table("funded_leads").update(data).eq("id", lead_id).execute()


# ── Job postings ───────────────────────────────────────────────────────────────

def get_job_by_url(url: str) -> Optional[dict]:
    res = get_client().table("job_postings").select("id").eq("job_url", url).execute()
    return res.data[0] if res.data else None


def get_job_by_company_title(company_id: str, job_title: str, within_days: int = 30) -> Optional[dict]:
    """Return existing job if same company+title was seen within the last N days.
    Time-bounded so a re-posted role after 30+ days is treated as a new opening.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=within_days)).isoformat()
    res = (get_client().table("job_postings")
           .select("id")
           .eq("company_id", company_id)
           .eq("job_title", job_title)
           .gte("created_at", cutoff)
           .execute())
    return res.data[0] if res.data else None


def insert_job_posting(data: dict) -> str:
    # Strip keys not in schema to avoid errors
    allowed = {
        "company_id", "contact_id", "source", "job_title", "job_url",
        "description_raw", "description_summary", "salary_min", "salary_max",
        "salary_currency", "posted_at", "location", "remote_scope",
        "experience_match", "years_min", "years_max", "cover_letter",
        "linkedin_note", "email_draft", "follow_up_message",
        "application_status", "outreach_status", "follow_up_generated",
        "notes", "raw_data", "track", "visa_sponsorship",
    }
    res = get_client().table("job_postings").insert({k: v for k, v in data.items() if k in allowed}).execute()
    return res.data[0]["id"]


def get_jobs_needing_followup(days: int = 7) -> list[dict]:
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    res = (get_client().table("job_postings")
           .select("id,job_title,company_id,linkedin_note,outreach_status,application_status")
           .eq("follow_up_generated", False)
           .in_("outreach_status", ["connection_sent"])
           .lt("outreach_last_action_at", cutoff)
           .execute())
    return res.data or []


def update_job_posting(job_id: str, data: dict):
    get_client().table("job_postings").update(data).eq("id", job_id).execute()


# ── Cleanup ────────────────────────────────────────────────────────────────────

def cleanup_old_records(days: int = 30) -> dict:
    """
    Delete untouched records older than N days.
    SAFE: only deletes records the user has never interacted with.
    - job_postings:  application_status='new' AND outreach_status='new'
    - funded_leads:  status='new'
    Returns counts of deleted records.
    """
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    db = get_client()

    # Jobs: only delete if user has never touched them
    jobs_res = (db.table("job_postings")
                .delete()
                .eq("application_status", "new")
                .eq("outreach_status", "new")
                .lt("created_at", cutoff)
                .execute())
    jobs_deleted = len(jobs_res.data) if jobs_res.data else 0

    # Funded leads: only delete if user has never touched them
    leads_res = (db.table("funded_leads")
                 .delete()
                 .eq("status", "new")
                 .lt("created_at", cutoff)
                 .execute())
    leads_deleted = len(leads_res.data) if leads_res.data else 0

    return {"jobs_deleted": jobs_deleted, "leads_deleted": leads_deleted}


# ── Cross-track check ──────────────────────────────────────────────────────────

def get_recent_outreach_for_company(company_id: str, days: int = 90) -> bool:
    """Returns True if company was contacted in either track within N days."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    funded = (get_client().table("funded_leads")
              .select("id").eq("company_id", company_id)
              .neq("status", "closed").gte("created_at", cutoff).execute())
    if funded.data:
        return True

    jobs = (get_client().table("job_postings")
            .select("id").eq("company_id", company_id)
            .not_.in_("outreach_status", ["new", "cant_find"])
            .gte("created_at", cutoff).execute())
    return bool(jobs.data)
