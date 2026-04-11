"""
linkedin_people_finder.py — Find multiple people at a company via Exa's LinkedIn index.

Uses Exa neural search on linkedin.com/in/* profiles to return a list of people
working at a given company. Returns up to 5 contacts with name, title, linkedin_url.

No Apollo, no Hunter — purely Exa's public web index of LinkedIn profiles.
Each Exa search costs 1 Exa API call. We run 2 searches per company max.
"""
import re
import requests
from pipeline.config import EXA_API_KEY, EXA_API_KEY_2, HTTP_TIMEOUT
from pipeline import tracker

_EXA_URL = "https://api.exa.ai/search"

# Title groups — search separately to get both C-suite and product/design people
_TITLE_GROUP_1 = "CEO OR Founder OR \"Co-Founder\" OR CTO OR COO"
_TITLE_GROUP_2 = "CPO OR \"Head of Product\" OR \"Head of Design\" OR \"VP Product\" OR \"VP Design\" OR \"Product Designer\""

# Regex to extract name from LinkedIn URL slug: /in/john-smith → John Smith
_SLUG_RE = re.compile(r'/in/([a-z0-9\-]+)/?$')

# Regex to find "Name - Title at Company" pattern in snippet
_SNIPPET_RE = re.compile(
    r'^([A-Z][a-zA-Z\-\'\.]{1,20}\s+[A-Z][a-zA-Z\-\'\.]{1,25})\s*[\-–|]\s*(.+?)(?:\s+at\s+|\s*\|)',
    re.MULTILINE
)

def _slug_to_name(slug: str) -> str | None:
    """Convert linkedin URL slug to a name guess. john-smith → John Smith"""
    parts = slug.split('-')
    # Filter out numeric parts (profile disambiguators like john-smith-12345)
    name_parts = [p.capitalize() for p in parts if p.isalpha() and len(p) > 1]
    if len(name_parts) >= 2:
        return ' '.join(name_parts[:2])
    return None

def _extract_from_result(result: dict, company_name: str) -> dict | None:
    """Extract name + title from a single Exa result. Returns contact dict or None."""
    url = result.get('url') or (result.get('id') if isinstance(result, dict) else '') or ''
    title_field = result.get('title') or ''
    snippet = result.get('text') or result.get('snippet') or ''

    # Skip non-profile URLs
    if 'linkedin.com/in/' not in url:
        return None

    # Extract LinkedIn URL slug → candidate name
    slug_match = _SLUG_RE.search(url)
    slug_name = _slug_to_name(slug_match.group(1)) if slug_match else None

    # Try to get name + title from page title: "John Smith - CEO at SimpleChain | LinkedIn"
    name, job_title = None, None
    title_match = re.match(
        r'^([A-Z][a-zA-Z\-\'\.]{1,20}\s+[A-Z][a-zA-Z\-\'\.]{1,25})\s*[-–|]\s*(.+?)(?:\s*\||\s*at\s+)',
        title_field
    )
    if title_match:
        name = title_match.group(1).strip()
        job_title = title_match.group(2).strip()

    # Fallback: use slug-derived name
    if not name:
        name = slug_name
    if not name:
        return None

    # Skip obviously wrong names (single word, all lowercase in slug)
    if len(name.split()) < 2:
        return None

    return {
        'apollo_person_id': None,
        'name':             name,
        'title':            job_title,
        'linkedin_url':     url.split('?')[0],  # strip query params
        'twitter_url':      None,
        'seniority':        None,
        'org_name':         company_name,
        'org_website':      None,
        'org_linkedin':     None,
    }

def _exa_search(query: str, num_results: int = 5) -> list[dict]:
    """Run Exa search with key rotation. Returns list of result dicts."""
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


def find_people(company_name: str, domain: str | None = None, max_results: int = 5) -> list[dict]:
    """
    Find multiple people at a company using Exa's LinkedIn profile index.

    Args:
        company_name: Company name as stored in DB
        domain:       Company domain (optional, used to improve search accuracy)
        max_results:  Max contacts to return (default 5)

    Returns:
        List of contact dicts (same shape as apollo.find_contact output),
        ordered by seniority (C-suite first). Empty list if nothing found.
    """
    if not company_name:
        return []

    company_q = f'"{company_name}"'
    seen_urls = set()
    seen_names = set()
    contacts = []

    # Search 1: C-suite (CEO, Founder, CTO)
    q1 = f'{company_q} site:linkedin.com/in {_TITLE_GROUP_1}'
    for result in _exa_search(q1, num_results=5):
        contact = _extract_from_result(result, company_name)
        if not contact:
            continue
        url_key = contact['linkedin_url'].lower()
        name_key = contact['name'].lower()
        if url_key in seen_urls or name_key in seen_names:
            continue
        seen_urls.add(url_key)
        seen_names.add(name_key)
        contacts.append(contact)
        if len(contacts) >= max_results:
            break

    # Search 2: Product/Design roles (only if we have room)
    if len(contacts) < max_results:
        q2 = f'{company_q} site:linkedin.com/in {_TITLE_GROUP_2}'
        for result in _exa_search(q2, num_results=5):
            contact = _extract_from_result(result, company_name)
            if not contact:
                continue
            url_key = contact['linkedin_url'].lower()
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
        print(f'[linkedin_finder] No LinkedIn profiles found for {company_name}')

    return contacts
