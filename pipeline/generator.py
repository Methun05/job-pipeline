"""
Gemini-powered content generation.
One API call per company (Track A) or job posting (Track B).
All tasks batched into a single prompt per record.

Key fallback: if primary key hits daily quota, auto-rotates to GEMINI_API_KEY_2.
"""
import json
import re
import time
import requests
from google import genai
from pipeline.config import GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_MODEL, GEMINI_ENABLED, PROFILE, HTTP_TIMEOUT
from bs4 import BeautifulSoup

# ── Client pool ────────────────────────────────────────────────────────────────
_clients: list | None = None
_active_idx: int      = 0   # which key we're currently using


def _get_clients() -> list:
    global _clients
    if _clients is None:
        pool = [genai.Client(api_key=GEMINI_API_KEY)]
        if GEMINI_API_KEY_2:
            pool.append(genai.Client(api_key=GEMINI_API_KEY_2))
        _clients = pool
    return _clients


def _active_client():
    return _get_clients()[_active_idx]


def _rotate_key():
    """Switch to the next available key. Returns True if rotated, False if none left."""
    global _active_idx
    clients = _get_clients()
    if _active_idx + 1 < len(clients):
        _active_idx += 1
        print(f"[Gemini] Primary key quota exhausted — switching to fallback key #{_active_idx + 1}")
        return True
    return False


def _raw_generate(prompt: str) -> str:
    """
    Call Gemini and return raw text. Handles rate limits and key rotation.
    Raises on unrecoverable failure.
    """
    if not GEMINI_ENABLED:
        raise RuntimeError("Gemini disabled (GEMINI_ENABLED=False)")

    time.sleep(1)  # respect 15 RPM free-tier limit

    for key_attempt in range(len(_get_clients())):
        client = _active_client()
        for retry in range(2):
            try:
                resp = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                )
                return resp.text.strip()
            except Exception as e:
                err = str(e)
                if "429" in err:
                    is_per_day = "PerDay" in err or "per_day" in err.lower() or "daily" in err.lower()
                    if is_per_day:
                        # Quota fully exhausted for this key — try next
                        if not _rotate_key():
                            raise RuntimeError("All Gemini API keys have exhausted their daily quota.")
                        break  # break retry loop, outer loop picks next client
                    # Regular RPM 429 — wait and retry once
                    if retry == 0:
                        print("[Gemini] 429 rate limit — waiting 60s before retry...")
                        time.sleep(60)
                        continue
                raise

    raise RuntimeError("All Gemini API keys failed.")


def _call_gemini(prompt: str) -> dict:
    """Call Gemini, return parsed JSON dict."""
    text = _raw_generate(prompt)
    json_match = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
    if json_match:
        text = json_match.group(1)
    return json.loads(text)


def fetch_website_text(url: str, max_chars: int = 1500) -> str:
    """Fetch and strip a webpage to plain text. Returns empty string on failure."""
    if not url:
        return ""
    try:
        if not url.startswith("http"):
            url = "https://" + url
        resp = requests.get(url, timeout=HTTP_TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"
        })
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return soup.get_text(separator=" ", strip=True)[:max_chars]
    except Exception:
        return ""


# ── Track A: Funded company ───────────────────────────────────────────────────

def generate_funded_company_content(
    company_name: str,
    website: str,
    funding_amount: float,
    round_type: str,
) -> dict:
    """Returns: {summary, company_type, linkedin_note, email_subject, email_body}"""
    website_text = fetch_website_text(website, max_chars=3000)
    has_website  = bool(website_text)

    p = PROFILE
    prompt = f"""You are helping {p['name']}, a {p['role']} with {p['years']} years of experience.
Specialization: {p['specialization']}
Portfolio: {p['portfolio']}
Tone: {p['tone']}

Company: {company_name}
Funding: {round_type}, ${funding_amount:,.0f}
{"Website content: " + website_text if has_website else "Note: Company website was not accessible."}

Generate a JSON response with these exact keys:
{{
  "summary": "2-3 sentence description of what this company does and who they serve. If website unavailable, write 'Summary not available — website could not be fetched.' ",
  "company_type": "One of exactly: 'Consumer App', 'DeFi / Protocol', 'B2B Tooling', 'Infrastructure', 'Exchange / Trading'. Pick the best fit based on what the company builds.",
  "linkedin_note": "LinkedIn connection request message. Under 300 characters. Reference the funding round AND something specific about the company. From {p['name']}'s perspective as a designer. Not desperate. Confident and specific.",
  "email_subject": "Short, specific email subject line (under 60 chars)",
  "email_body": "3-4 sentence email. Opens with specific insight about company. Mentions designer background + crypto/DeFi experience. Ends with soft ask. Not generic."
}}

Return only the JSON object, no other text."""

    return _call_gemini(prompt)


# ── Track A: Extract funding from RSS article ─────────────────────────────────

def extract_funding_from_article(title: str, summary: str, source: str) -> dict | None:
    """
    Extracts funding info from TechCrunch/EU-Startups article text.
    Returns normalized dict or None if confidence < 0.7 or not a funding article.
    """
    prompt = f"""Extract funding round information from this article.

Title: {title}
Content: {summary[:1000]}

Return a JSON object with these exact keys:
{{
  "confidence": 0.0 to 1.0 (how confident you are this is a funding announcement),
  "company_name": "company name or null",
  "company_website": "company website URL or null",
  "funding_amount_usd": number in USD (convert from EUR/GBP if needed) or null,
  "round_type": "Pre-Seed" or "Seed" or "Series A" or "Series B" or "other",
  "sector": "fintech, crypto, saas, healthtech, edtech, etc."
}}

Rules:
- If article is NOT about a funding announcement, set confidence to 0.0
- If round type is not Pre-Seed/Seed/Series A/Series B, set round_type to "other"
- For EUR amounts: multiply by 1.08 to get USD
- For GBP amounts: multiply by 1.27 to get USD
- Only return the JSON object, no other text."""

    try:
        result = _call_gemini(prompt)
        confidence = float(result.get("confidence", 0))
        if confidence < 0.7:
            return None
        if result.get("round_type") == "other":
            return None
        if not result.get("company_name"):
            return None
        result["source"] = source
        return result
    except Exception:
        return None


# ── Track B: Job posting ───────────────────────────────────────────────────────

def generate_job_content(
    job_title: str,
    company_name: str,
    description: str,
    needs_experience_classification: bool = False,
    needs_remote_classification: bool = False,
    contact_name: str = "",
    contact_title: str = "",
    job_page_text: str = "",
) -> dict:
    """
    Returns: {
      requirements_bullets, candidate_location,
      experience_match (if requested), remote_scope (if requested)
    }
    job_page_text: full text fetched from the actual job URL — preferred over description
                   if available (scraped descriptions are often partial/tag-only).
    """
    p = PROFILE

    # Use the full job page if available — far more accurate than scraped description_raw
    best_description = job_page_text if len(job_page_text) > len(description) else description

    extra_tasks = ""
    extra_fields = ""
    if needs_experience_classification:
        extra_tasks += "\n- Classify the required experience level from the job description."
        extra_fields += '''\n  "experience_match": "strong" or "stretch" or "skip",'''
    if needs_remote_classification:
        extra_tasks += "\n- Determine if this role is remote-friendly for someone in India."
        extra_fields += '''\n  "remote_scope": "global" or "us_only" or "unclear",'''

    contact_context = ""
    if contact_name:
        contact_context = f"\nContact found at company: {contact_name} ({contact_title})"

    prompt = f"""You are helping {p['name']}, a {p['role']} with {p['years']} years of experience.
Specialization: {p['specialization']}
Skills: {p['skills']}
Background: {p['background']}

Job: {job_title} at {company_name}

Job description:
{best_description[:3000]}

Tasks:{extra_tasks}
- Extract 3 key requirements as bullet points
- Identify where the candidate must physically be located (NOT the company HQ — where the employee needs to work from)

Return a JSON object with these exact keys:
{{{extra_fields}
  "requirements_bullets": ["requirement 1", "requirement 2", "requirement 3"],
  "candidate_location": "short plain string — e.g. 'San Francisco, CA (onsite)', 'Remote – US only', 'Remote – worldwide', 'Europe timezone required', 'Not specified'"
}}

Return only the JSON object, no other text."""

    return _call_gemini(prompt)


# ── Follow-up message generation ───────────────────────────────────────────────

def generate_followup(
    context_type: str,
    company_name: str,
    original_message: str,
    contact_name: str = "",
    days_since: int = 7,
) -> str:
    """Generates a follow-up LinkedIn message. Returns the message string."""
    p = PROFILE
    prompt = f"""Write a follow-up LinkedIn message for {p['name']}, a {p['role']}.

Context: {p['name']} sent a connection request {days_since} days ago to {contact_name or 'a contact'} at {company_name} but hasn't received a response.

Original message sent:
{original_message}

Write a short follow-up message (under 250 characters) that:
- Is not pushy or desperate
- Briefly re-introduces context
- Has a clear but soft ask
- Feels human, not automated

Return only the message text, no JSON, no quotes."""

    return _raw_generate(prompt)
