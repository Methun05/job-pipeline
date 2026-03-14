"""
Visa sponsorship detection.
Only flags when explicitly stated — no broad/ambiguous keywords.
Returns False for "right to work" checks (those usually mean they WON'T sponsor).
"""

VISA_KEYWORDS = [
    "visa sponsorship",
    "will sponsor",
    "visa sponsored",
    "sponsor your visa",
]


def check_visa_sponsorship(text: str) -> bool:
    """Return True if job description explicitly mentions visa sponsorship."""
    if not text:
        return False
    text_lower = text.lower()
    return any(kw in text_lower for kw in VISA_KEYWORDS)
