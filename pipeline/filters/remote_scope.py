"""
Remote scope detection.
Code-first. Returns: 'global' | 'us_only' | 'unclear'
Unclear → caller passes to Groq.
"""
import re

GLOBAL_PATTERNS = re.compile(
    r'\b(worldwide|globally?\s+remote|remote[\s\-]+worldwide|'
    r'fully\s+remote|100%\s+remote|anywhere\s+in\s+the\s+world|'
    r'work\s+from\s+anywhere|location[\s\-]+independent|'
    r'all\s+timezones?|any\s+timezone?|global\s+remote)\b',
    re.IGNORECASE
)

US_ONLY_PATTERNS = re.compile(
    r'\b(us[\s\-]?only|united\s+states\s+only|must\s+be\s+(based\s+in|located\s+in)\s+(the\s+)?us|'
    r'us[\s\-]based|must\s+reside\s+in\s+(the\s+)?us|'
    r'authorized\s+to\s+work\s+in\s+(the\s+)?us|'
    r'eligible\s+to\s+work\s+in\s+(the\s+)?united\s+states|'
    r'us\s+citizens?\s+(only|required)|'
    r'remote[\s\-]+us|us[\s\-]+remote)\b',
    re.IGNORECASE
)

# These alone don't confirm global (company might still be US-restricted)
AMBIGUOUS_REMOTE = re.compile(r'\b(remote)\b', re.IGNORECASE)


def detect_remote_scope(text: str, location_field: str = "") -> str:
    combined = f"{location_field} {text}"

    if US_ONLY_PATTERNS.search(combined):
        return "us_only"
    if GLOBAL_PATTERNS.search(combined):
        return "global"

    # If "remote" appears but no qualifier → unclear
    if AMBIGUOUS_REMOTE.search(combined):
        return "unclear"

    return "unclear"
