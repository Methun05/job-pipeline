"""
linkedin_people_finder.py — Find multiple people at a company via Exa's LinkedIn index.

Uses Exa neural search on linkedin.com/in/* profiles to return a list of people
working at a given company. Returns up to 5 contacts with name, title, linkedin_url.

No Apollo, no Hunter — purely Exa's public web index of LinkedIn profiles.
Each Exa search costs 1 Exa API call. We run 2 searches per company max.

Filters applied to reduce false positives:
  1. Result text must mention the company name, domain, or LinkedIn slug
     (whole-word match via \b — prevents "meta" matching "metamask")
  2. Profiles with "@ OtherCompany" in title (where OtherCompany != ours) are skipped
"""
import re
import requests
from pipeline.config import EXA_API_KEY, EXA_API_KEY_2, HTTP_TIMEOUT
from pipeline import tracker

_EXA_URL = "https://api.exa.ai/search"

# Title groups — search separately to get both C-suite and product/design people
_TITLE_GROUP_1 = 'CEO OR Founder OR "Co-Founder" OR CTO OR COO'
_TITLE_GROUP_2 = 'CPO OR "Head of Product" OR "Head of Design" OR "VP Product" OR "VP Design" OR "Product Designer"'

# Regex: extract LinkedIn URL slug /in/john-smith
_SLUG_RE = re.compile(r'/in/([a-z0-9\-]+)/?$')

# Regex: "@ SomeCompany" in a title string
_AT_COMPANY_RE = re.compile(r'@\s*([A-Za-z][A-Za-z0-9\s\-]{1,40}?)(?:\s*\||$|\s*,|\s*-)')


def _linkedin_slug(linkedin_url: str | None) -> str | None:
    """Extract company slug from a LinkedIn company URL.
    e.g. https://www.linkedin.com/company/darklake-labs → darklake-labs
    """
    if not linkedin_url:
        return None
    m = re.search(r'linkedin\.com/company/([a-z0-9\-]+)', linkedin_url.lower())
    return m.group(1) if m else None


def _company_tokens(company_name: str, domain: str | None, slug: str | None) -> set[str]:
    """Build lowercase token set for company verification against result text."""
    tokens: set[str] = set()
    for word in company_name.lower().split():
        if len(word) > 2:
            tokens.add(word)
    if domain:
        # darklake.fi → darklake
        tokens.add(domain.split('.')[0].lower())
    if slug:
        # darklake-labs → darklake, labs
        for part in slug.replace('-', ' ').split():
            if len(part) > 2:
                tokens.add(part.lower())
    return tokens


def _token_in_text(token: str, text: str) -> bool:
    """Whole-word token match. Prevents 'meta' matching 'metamask', 'ark' matching 'marketplace'."""
    return bool(re.search(rf'\b{re.escape(token)}\b', text, re.IGNORECASE))


def _is_current_employee(result: dict, job_title: str | None, tokens: set[str]) -> bool:
    """
    Two-stage filter:
    1. Result text must mention the company (via whole-word token match).
    2. If title has "@ OtherCompany", OtherCompany must match our tokens.
    """
    text = (result.get('text') or '') + ' ' + (result.get('title') or '')

    # Stage 1: company mention check (whole-word — prevents substring collisions)
    if not any(_token_in_text(token, text) for token in tokens):
        return False

    # Stage 2: "@ OtherCompany" check (also whole-word)
    if job_title:
        at_match = _AT_COMPANY_RE.search(job_title)
        if at_match:
            other = at_match.group(1).strip()
            # If OtherCompany shares no token with ours → they've moved on
            if not any(_token_in_text(token, other) for token in tokens):
                return False

    return True


def _slug_to_name(slug: str) -> str | None:
    """Convert LinkedIn URL slug to a best-guess name. john-smith → John Smith"""
    parts = slug.split('-')
    name_parts = [p.capitalize() for p in parts if p.isalpha() and len(p) > 1]
    if len(name_parts) >= 2:
        return ' '.join(name_parts[:2])
    return None


def _extract_from_result(result: dict, company_name: str, tokens: set[str]) -> dict | None:
    """Extract name + title, apply employee filter. Returns contact dict or None."""
    url         = result.get('url') or ''
    title_field = result.get('title') or ''

    if 'linkedin.com/in/' not in url:
        return None

    # Step 1: extract name — grab first two capitalised tokens (handles all separator styles)
    # e.g. "John Smith - CEO at Kulipa"  OR  "Benoit Roger | Head of Compliance @Kulipa - tags"
    name, job_title = None, None
    name_match = re.match(r'^([A-Z][a-zA-Z\-\'\.]+)\s+([A-Z][a-zA-Z\-\'\.]+)', title_field)
    if name_match:
        name = name_match.group(1) + ' ' + name_match.group(2)
        # Step 2: extract title — between first separator and next section break
        # Use space-surrounded dash (\s+[-–]\s+) or pipe as section break, not bare hyphen
        # This keeps "Co-Founder" intact while splitting on " - " or " | "
        rest = title_field[name_match.end():]
        title_match = re.match(r'\s*[-–|]\s*(.+?)(?:\s+[-–]\s+|\s*[|]|$)', rest)
        if title_match:
            raw_title = title_match.group(1).strip()
            # Drop trailing "at CompanyName" or "@CompanyName" — keep the role part only
            role_match = re.match(r'^(.+?)(?:\s+at\s+|\s*@)', raw_title, re.IGNORECASE)
            job_title = role_match.group(1).strip() if role_match else raw_title

    # Fallback: slug-derived name
    if not name:
        slug_match = _SLUG_RE.search(url)
        if slug_match:
            name = _slug_to_name(slug_match.group(1))

    if not name or len(name.split()) < 2:
        return None

    # Apply employee filter
    if not _is_current_employee(result, job_title, tokens):
        return None

    return {
        'apollo_person_id': None,
        'name':             name,
        'title':            job_title,
        'linkedin_url':     url.split('?')[0],
        'twitter_url':      None,
        'seniority':        None,
        'org_name':         company_name,
        'org_website':      None,
        'org_linkedin':     None,
    }


def _exa_search(query: str, num_results: int = 5) -> list[dict]:
    """Run Exa search with key1 → key2 rotation."""
    keys = [k for k in (EXA_API_KEY, EXA_API_KEY_2) if k]
    if not keys:
        return []

    payload = {
        'query':      query,
        'type':       'neural',
        'numResults': num_results,
        'contents':   {'text': {'maxCharacters': 500}},
    }

    for i, key in enumerate(keys):
        try:
            resp = requests.post(
                _EXA_URL,
                json=payload,
                headers={'x-api-key': key, 'Content-Type': 'application/json'},
                timeout=HTTP_TIMEOUT,
            )
            if resp.status_code in (429, 402):
                print(f'[linkedin_finder] Exa key {i+1} quota — rotating')
                tracker.record_fallback(f'exa_key{i+1}', f'exa_key{i+2}', 'quota', 'linkedin_people_finder')
                continue
            resp.raise_for_status()
            tracker.record_call('exa')
            return resp.json().get('results') or []
        except Exception as e:
            err = str(e).lower()
            if any(kw in err for kw in ('quota', '429', '402', 'limit')) and i + 1 < len(keys):
                continue
            print(f'[linkedin_finder] Exa error: {e}')
            return []
    return []


def find_people(
    company_name: str,
    domain:       str | None = None,
    linkedin_url: str | None = None,
    max_results:  int = 5,
) -> list[dict]:
    """
    Find multiple people at a company using Exa's LinkedIn profile index.

    Args:
        company_name: Company name as stored in DB
        domain:       Company domain — used in search query + false-positive filter
        linkedin_url: Company LinkedIn URL — slug extracted and used to tighten query
        max_results:  Max contacts to return (default 5)

    Returns:
        List of verified contact dicts (same shape as apollo.find_contact),
        C-suite first. Empty list if nothing found.
    """
    if not company_name:
        return []

    slug   = _linkedin_slug(linkedin_url)
    tokens = _company_tokens(company_name, domain, slug)

    # Build the primary search term — prefer domain over company name when available
    # because domain is unique; company name can collide (e.g. "Darklake" → "Dark" + "Lake")
    if domain:
        primary_q = f'"{domain}"'
    elif slug:
        primary_q = f'"{slug}"'
    else:
        primary_q = f'"{company_name}"'

    seen_urls  : set[str] = set()
    seen_names : set[str] = set()
    contacts   : list[dict] = []

    for title_group in [_TITLE_GROUP_1, _TITLE_GROUP_2]:
        if len(contacts) >= max_results:
            break
        query = f'{primary_q} site:linkedin.com/in {title_group}'
        for result in _exa_search(query, num_results=5):
            contact = _extract_from_result(result, company_name, tokens)
            if not contact:
                continue
            url_key  = contact['linkedin_url'].lower()
            name_key = contact['name'].lower()
            if url_key in seen_urls or name_key in seen_names:
                continue
            seen_urls.add(url_key)
            seen_names.add(name_key)
            contacts.append(contact)
            if len(contacts) >= max_results:
                break

    if contacts:
        print(f'[linkedin_finder] Found {len(contacts)} people at {company_name}: {[c["name"] for c in contacts]}')
    else:
        print(f'[linkedin_finder] No verified LinkedIn profiles found for {company_name}')

    return contacts
