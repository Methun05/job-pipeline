"""
Twitter/X job lead pipeline — standalone, sync, manual-trigger only.

Flow:
  1. Fetch tweets via Exa search (Gate 1 filtering in fetcher)
  2. Gate 2: Gemini classify_tweet() — only keep confidence > 0.75
  3. Upsert to twitter_leads table (ON CONFLICT tweet_url DO NOTHING)

Run with:
  python3 scripts/twitter_pipeline.py

Or from repo root:
  python3 -m scripts.twitter_pipeline
"""
import sys
import os

# Ensure repo root is on path when running as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone
from pipeline.fetchers.twitter_jobs import fetch as fetch_tweets
from pipeline.generator import classify_tweet
from pipeline.config import GEMINI_ENABLED, SUPABASE_URL, SUPABASE_SERVICE_KEY

CONFIDENCE_THRESHOLD = 0.75


def get_supabase():
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def run():
    print(f"[TwitterPipeline] Starting at {datetime.now(timezone.utc).isoformat()}")

    # ── Step 1: Fetch + Gate 1 ────────────────────────────────────────────────
    leads = fetch_tweets(days_back=7)
    if not leads:
        print("[TwitterPipeline] No leads after Gate 1. Done.")
        return

    # ── Step 2: Gate 2 — Gemini classification ────────────────────────────────
    if not GEMINI_ENABLED:
        print("[TwitterPipeline] Gemini disabled — saving all Gate 1 leads with confidence=null")
        classified = [
            {**lead, "gemini_confidence": None, "role_mentioned": None, "company_name": None, "poster_type": "unknown"}
            for lead in leads
        ]
    else:
        classified = []
        for lead in leads:
            try:
                result = classify_tweet(
                    tweet_text  = lead.get("tweet_text", ""),
                    poster_bio  = lead.get("poster_bio", ""),
                    poster_name = lead.get("poster_name", ""),
                )
                confidence = float(result.get("confidence", 0))
                is_job     = bool(result.get("is_job", False))

                if not is_job or confidence < CONFIDENCE_THRESHOLD:
                    print(f"[Gate2] Skip {lead['poster_handle']} — is_job={is_job} conf={confidence:.2f}")
                    continue

                classified.append({
                    **lead,
                    "gemini_confidence": confidence,
                    "role_mentioned":    result.get("role"),
                    "company_name":      result.get("company_name"),
                    "poster_type":       result.get("poster_type", "unknown"),
                })
                print(f"[Gate2] Keep @{lead['poster_handle']} — {result.get('role')} at {result.get('company_name')} (conf={confidence:.2f})")
            except Exception as e:
                print(f"[Gate2] Error classifying {lead.get('tweet_url')}: {e}")

    print(f"[TwitterPipeline] Gate 2 passed: {len(classified)} leads")

    if not classified:
        print("[TwitterPipeline] No leads passed Gate 2. Done.")
        return

    # ── Step 3: Upsert to Supabase ────────────────────────────────────────────
    db = get_supabase()
    saved = 0
    skipped = 0

    for lead in classified:
        try:
            row = {
                "tweet_url":        lead["tweet_url"],
                "tweet_text":       lead.get("tweet_text"),
                "posted_at":        lead.get("posted_at"),
                "poster_handle":    lead.get("poster_handle"),
                "poster_name":      lead.get("poster_name"),
                "poster_bio":       lead.get("poster_bio"),
                "poster_followers": lead.get("poster_followers"),
                "poster_type":      lead.get("poster_type"),
                "company_name":     lead.get("company_name"),
                "role_mentioned":   lead.get("role_mentioned"),
                "gemini_confidence": lead.get("gemini_confidence"),
                "status":           "new",
            }
            # ON CONFLICT DO NOTHING — idempotent re-runs
            result = (
                db.table("twitter_leads")
                .upsert(row, on_conflict="tweet_url", ignore_duplicates=True)
                .execute()
            )
            if result.data:
                saved += 1
                print(f"[DB] Saved: @{lead.get('poster_handle')} — {lead.get('tweet_url')}")
            else:
                skipped += 1  # already exists
        except Exception as e:
            print(f"[DB] Error saving {lead.get('tweet_url')}: {e}")

    print(f"""
[TwitterPipeline] Complete.
  Fetched (Gate 1): {len(leads)}
  Classified (Gate 2): {len(classified)}
  Saved: {saved}
  Skipped (duplicate): {skipped}
""")


if __name__ == "__main__":
    run()
