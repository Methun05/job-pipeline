"""
Central config: profile data injected into every Gemini prompt,
plus pipeline constants.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── API Keys ──────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY       = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_KEY_2     = os.getenv("GEMINI_API_KEY_2", "")
APOLLO_API_KEY       = os.getenv("APOLLO_API_KEY", "")
HUNTER_API_KEY       = os.getenv("HUNTER_API_KEY", "")
BRAVE_API_KEY        = os.getenv("BRAVE_API_KEY", "")
EXA_API_KEY          = os.getenv("EXA_API_KEY", "")
EXA_API_KEY_2        = os.getenv("EXA_API_KEY_2", "")
TAVILY_API_KEY       = os.getenv("TAVILY_API_KEY", "")

# ── Gemini model ──────────────────────────────────────────────────────────────
GEMINI_MODEL    = "gemini-2.5-flash"
GEMINI_ENABLED  = True

# ── My profile (injected into every generation prompt) ────────────────────────
PROFILE = {
    "name":           "Methun R",
    "role":           "Product Designer",
    "years":          4,
    "specialization": "Crypto/web3 UX, DeFi products, complex financial interfaces",
    "skills":         "Figma, design systems, user research, prototyping, mobile-first design",
    "background":     "Currently at a crypto company (remote, India-based)",
    "looking_for":    "Remote product designer role at a foreign company",
    "portfolio":      "https://www.methun.design/",
    "tone":           "Confident, specific, concise. Not desperate. Not generic.",
}

# ── Pipeline constants ─────────────────────────────────────────────────────────
TRACK_A_DAYS_WINDOW     = 45     # funded within last N days
TRACK_B_HOURS_WINDOW    = 72     # posted within last N hours
FOLLOW_UP_DAYS          = 7      # generate follow-up after N days of inaction
DEDUP_FUZZY_THRESHOLD   = 85     # RapidFuzz token_set_ratio threshold
NINETY_DAY_RESET        = 90     # re-contact after N days
APOLLO_CREDIT_ALERT     = 30     # warn dashboard when credits below this
CLEANUP_DAYS            = 30     # delete untouched records older than N days
FUNDING_MIN_USD         = 1_000_000
FUNDING_MAX_USD         = 50_000_000

# Design role keywords (regex OR list — used by role filter)
DESIGN_ROLE_KEYWORDS = [
    "product designer",
    "ux designer",
    "ui designer",
    "product design lead",
    "ux/ui designer",
    "ui/ux designer",
    "design lead",
]

# Experience keywords that signal skip-tier (8+ years / staff / principal / director)
SKIP_TIER_KEYWORDS = [
    "staff designer",
    "principal designer",
    "principal product designer",
    "design director",
    "director of design",
    "vp of design",
    "head of design",
    "7+ years",
    "7 years",
    "8+ years",
    "10+ years",
    "10 years",
    "12+ years",
]

HTTP_TIMEOUT = 15   # seconds for all external HTTP requests
