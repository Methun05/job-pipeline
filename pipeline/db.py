"""
All Supabase database operations.
Uses service role key — bypasses RLS.
"""
import json
from datetime import datetime, timezone
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
        "apollo_credits_remaining": credits,
    }
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


def update_company(company_id: str, data: dict):
    get_client().table("companies").update(data).eq("id", company_id).execute()


def upsert_company(data: dict) -> str:
    """Insert or update company. Returns company id."""
    domain = data.get("domain")
    existing = get_company_by_domain(domain) if domain else None
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


def insert_job_posting(data: dict) -> str:
    res = get_client().table("job_postings").insert(data).execute()
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
