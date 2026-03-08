"""
Experience level extraction.
Code-first approach: regex handles explicit year mentions.
Returns: 'strong' | 'stretch' | 'skip' | 'ambiguous'
Ambiguous → caller passes to Groq for classification.
"""
import re
from pipeline.config import SKIP_TIER_KEYWORDS

# Patterns like "4+ years", "3-5 years", "minimum 6 years"
YEARS_PATTERN = re.compile(
    r'(\d+)\s*[\+\-–—to]+\s*(\d+)?\s*years?|'
    r'(\d+)\+\s*years?|'
    r'minimum\s+of\s+(\d+)\s*years?|'
    r'at\s+least\s+(\d+)\s*years?',
    re.IGNORECASE
)

SENIOR_KEYWORDS    = re.compile(r'\b(senior|sr\.?|principal|staff)\b', re.IGNORECASE)
MID_KEYWORDS       = re.compile(r'\b(mid[\-\s]?level|mid[\-\s]?senior|intermediate)\b', re.IGNORECASE)
JUNIOR_KEYWORDS    = re.compile(r'\b(junior|jr\.?|entry[\-\s]?level|graduate|intern)\b', re.IGNORECASE)


def classify_experience(text: str) -> tuple[str, int | None, int | None]:
    """
    Returns (match_level, years_min, years_max)
    match_level: 'strong' | 'stretch' | 'skip' | 'ambiguous'
    """
    text_lower = text.lower()

    # Hard skip: skip-tier keywords anywhere in description
    for kw in SKIP_TIER_KEYWORDS:
        if kw.lower() in text_lower:
            return ("skip", None, None)

    # Try to extract explicit year range
    matches = YEARS_PATTERN.findall(text)
    if matches:
        years = []
        for m in matches:
            nums = [int(x) for x in m if x and x.isdigit()]
            years.extend(nums)

        if years:
            min_y = min(years)
            max_y = max(years)

            if max_y >= 7 or min_y >= 7:
                return ("skip", min_y, max_y)
            elif max_y >= 5 or min_y >= 5:
                return ("stretch", min_y, max_y)
            else:
                return ("strong", min_y, max_y)

    # Keyword-based fallback
    if JUNIOR_KEYWORDS.search(text):
        return ("strong", 0, 2)
    if MID_KEYWORDS.search(text):
        return ("strong", 2, 5)
    if SENIOR_KEYWORDS.search(text):
        return ("skip", 5, 7)

    return ("ambiguous", None, None)
