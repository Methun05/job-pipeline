"""
Quick test: verifies Apollo returns org_name, org_website, org_linkedin.
Run: python test_apollo_org.py
"""
import json
from pipeline.apollo import find_contact

# Well-known crypto companies — should have Apollo data
TEST_COMPANIES = [
    ("QFEX",          ""),           # real company from our DB, name-only search
    ("Utexo",         ""),           # real company from our DB
    ("Hyperliquid",   "hyperliquid.xyz"),
    ("dYdX",          "dydx.exchange"),
]

print("=" * 60)
print("Apollo org data test")
print("=" * 60)

for company_name, domain in TEST_COMPANIES:
    print(f"\n→ Searching: {company_name} (domain: {domain})")
    result = find_contact(company_name, domain, None)
    if result:
        print(f"  Contact:        {result['name']} — {result['title']}")
        print(f"  LinkedIn:       {result['linkedin_url']}")
        print(f"  org_name:       {result['org_name']}")
        print(f"  org_website:    {result['org_website']}")
        print(f"  org_linkedin:   {result['org_linkedin']}")
        # Validation check
        if result['org_name']:
            match = company_name.lower() in (result['org_name'] or "").lower()
            print(f"  Name match:     {'✓ YES' if match else '⚠ NO — Apollo returned: ' + str(result['org_name'])}")
    else:
        print("  No contact found.")
    print()
