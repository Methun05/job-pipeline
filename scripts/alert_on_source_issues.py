"""
Post-pipeline alert script.
Reads the latest pipeline_run from Supabase and sends an email via Resend
if any job sources failed or returned 0 results.

Required GitHub secrets:
  SUPABASE_URL         — already used by pipeline
  SUPABASE_SERVICE_KEY — already used by pipeline
  RESEND_API_KEY       — get free key at resend.com (3000 emails/month free)
  ALERT_EMAIL          — email address to receive alerts (e.g. methun@gmail.com)

Optional:
  RESEND_FROM_EMAIL    — from address for alerts (default: onboarding@resend.dev)
                         If you've verified methun.design in Resend, set this to
                         alerts@methun.design for a cleaner sender name.

If RESEND_API_KEY or ALERT_EMAIL is missing, script exits silently (no crash).
"""
import os
import json
import sys
import urllib.request

# Sources where 0 results is suspicious (genuinely active boards)
EXPECTED_ACTIVE = {
    "web3career", "cryptojobslist", "cryptocurrencyjobs",
    "hashtagweb3", "paradigm", "a16zcrypto",
}

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
RESEND_KEY   = os.getenv("RESEND_API_KEY", "")
ALERT_EMAIL  = os.getenv("ALERT_EMAIL", "")
FROM_EMAIL   = os.getenv("RESEND_FROM_EMAIL", "Job Pipeline <onboarding@resend.dev>")


def supabase_get(path: str) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def send_email(subject: str, html: str):
    payload = json.dumps({
        "from":    FROM_EMAIL,
        "to":      [ALERT_EMAIL],
        "subject": subject,
        "html":    html,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_KEY}",
            "Content-Type":  "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def main():
    if not RESEND_KEY or not ALERT_EMAIL:
        print("[Alert] RESEND_API_KEY or ALERT_EMAIL not set — skipping alert")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[Alert] Supabase env vars missing — skipping alert")
        return

    # Fetch the latest pipeline run
    try:
        runs = supabase_get(
            "pipeline_runs?select=*&order=started_at.desc&limit=1"
        )
    except Exception as e:
        print(f"[Alert] Failed to fetch pipeline run: {e}")
        return

    if not runs:
        print("[Alert] No pipeline runs found")
        return

    run = runs[0]
    errors        = run.get("errors") or []
    source_counts = run.get("source_counts") or {}
    status        = run.get("status", "unknown")
    track_b_new   = run.get("track_b_new", 0)

    # Find broken sources (fetch errors)
    fetcher_errors = [e for e in errors if e.get("source") in EXPECTED_ACTIVE]

    # Find sources that returned 0 silently
    errored_sources = {e.get("source") for e in fetcher_errors}
    silent_zeros = [
        name for name in EXPECTED_ACTIVE
        if source_counts.get(name) == 0 and name not in errored_sources
    ]

    issues = []
    for e in fetcher_errors:
        issues.append(f"<b>{e['source']}</b>: fetch error — {e['message'][:120]}")
    for name in silent_zeros:
        issues.append(f"<b>{name}</b>: returned 0 jobs (may be broken or just empty)")

    # Also alert if pipeline hard-failed
    if status == "failed":
        issues.insert(0, "<b>Pipeline hard-failed</b> — check GitHub Actions logs")

    if not issues:
        print(f"[Alert] No source issues found — {track_b_new} new jobs saved. No email sent.")
        return

    # Build email
    issues_html = "".join(f"<li style='margin:6px 0'>{i}</li>" for i in issues)
    html = f"""
<div style="font-family: sans-serif; max-width: 560px; color: #1a1a1a;">
  <h2 style="color: #dc2626; margin-bottom: 4px;">⚠ Job Pipeline Alert</h2>
  <p style="color: #6b7280; margin-top: 0;">
    {len(issues)} issue{"s" if len(issues) > 1 else ""} detected in today's run
    · {track_b_new} new jobs saved
  </p>
  <ul style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
             padding: 16px 16px 16px 32px; margin: 0;">
    {issues_html}
  </ul>
  <p style="margin-top: 16px; color: #6b7280; font-size: 13px;">
    Check <a href="https://tracker.methun.design" style="color:#2563eb">tracker.methun.design</a>
    for details.
  </p>
</div>
"""

    try:
        send_email(f"⚠ Job Pipeline: {len(issues)} source issue(s) today", html)
        print(f"[Alert] Email sent — {len(issues)} issue(s) reported")
    except Exception as e:
        print(f"[Alert] Failed to send email: {e}")


if __name__ == "__main__":
    main()
