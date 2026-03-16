# Job Pipeline — Project Context for Reviewers & AI Agents

> Read this before touching any code. This project is live and runs daily.

---

## Why this exists

Job hunting manually is slow. This pipeline automates two specific strategies for a **Product Designer (5 years exp, crypto/web3 UX)** looking for remote roles:

1. **Proactive outreach** — Find companies the moment they get funded (warm money = active hiring). Reach out before they post a job.
2. **Passive monitoring** — Watch all major crypto job boards daily and surface only the relevant design roles.

It runs every day at **8 AM IST** and results appear at **https://tracker.methun.design**.

---

## Track A — Funded Companies

**Source**: CryptoRank scraper only (free, scrapes Next.js SSR data — no paid API).

**What we filter in:**
- Funding amount: **$1M – $50M** — this is the PRIMARY filter (too small = no design team yet, too large = already fully staffed)
- Date window: **last 45 days** — older than that, the moment has passed
- Round type: stored as metadata, **NOT a hard filter** (changed Mar 16 2026 — see below)

> **Round type is display-only — never a filter (fixed Mar 16 2026):**
> Round type was previously a hard filter (Pre-Seed, Seed, Series A, Series B only). This was wrong — CryptoRank SSR returns `stage: null` for ~75% of rounds, so filtering on stage silently dropped nearly everything. Amount ($1M–$50M) is the ONLY hard filter. Round type is just a label stored as-is from CryptoRank (null if unknown). The DB `valid_round` CHECK constraint was also dropped entirely — it added no value.
> Do NOT re-add any round type filter. A company raising $10M in Series C or an unknown stage is just as relevant as one in Seed.

**What we extract:**
- Company name, website, LinkedIn, funding amount + round type, announced date
- **Contact person** — the right person to reach out to, based on company size:
  - Small (<20 employees): CEO / Co-Founder / CTO
  - Mid (20–50 employees): CPO / Chief Product Officer / Head of Product
  - Large (50+): Head of Design / Design Manager
- Contact's name, title, LinkedIn URL, Twitter handle (for cold outreach)
- Email is **not extracted in the pipeline** — costs Apollo credits. Revealed on-demand from dashboard.

**Gemini generates** (per company): a company summary, LinkedIn note, email subject + body.

---

## Track B — Job Postings

**Sources (10 total):**
- web3career (scraper — /design-jobs page, no API key)
- cryptojobslist (RSS)
- cryptocurrencyjobs (RSS)
- dragonfly (scraper — Getro platform, jobs.dragonfly.xyz)
- arbitrum (scraper — Getro platform, jobs.arbitrum.io)
- hashtagweb3 (scraper — hashtagweb3.com, JSON-LD schema, 260+ listings)
- talentweb3 (recruiter aggregator — skip contact search for this source)
- solana_jobs (scraper — Getro platform, jobs.solana.com)
- paradigm (scraper — paradigm.xyz/jobs, 600+ portfolio company jobs, has salary data)
- sui_jobs (scraper — Getro platform, jobs.sui.io)

**Getro platform pattern** (dragonfly, arbitrum, solana_jobs, sui_jobs):
- All use `__NEXT_DATA__` SSR → `props.pageProps.initialState.jobs.found`
- `url` field is a direct job URL on Solana/Sui boards
- `organization.websiteUrl` may not exist on all Getro boards

**Paradigm board specifics:**
- `__NEXT_DATA__` → `props.pageProps.jobs` (different path from Getro)
- Has structured salary: `{minValue, maxValue, currency}` in USD
- `createdAt` is ISO string, `remote` is boolean, `locations` is array

**Filtering — in this order:**

1. **Role keyword match** — title must contain: product designer, UX designer, UI/UX, interaction designer, visual designer, etc. Everything else is dropped immediately.

2. **Experience level** — parsed from job description + title:
   - `skip` — hard skip: staff/principal/director/VP keywords, or 7+ years required
   - `stretch` — 5–6 years required (shown but flagged)
   - `strong` — 0–4 years required (ideal match)
   - `ambiguous` — no clear signal → Gemini classifies it

3. **Remote scope detection**:
   - `us_only` — explicit US restriction keywords → flagged
   - `global` — worldwide/fully remote/anywhere keywords
   - `unclear` — "remote" with no qualifier → Gemini classifies it

4. **Dedup** — URL exact match first (fastest), then company+title fuzzy match within 30-day window (catches same job relisted with a different URL)

**Gemini extracts** (per job): `requirements_bullets` (3 bullets), `candidate_location`, and optionally `experience_match` / `remote_scope` when rule-based classification is ambiguous.

> **Key**: Before calling Gemini, the pipeline fetches the actual `job_url` page (3000 chars) using `fetch_website_text(url, max_chars=3000)`. This gives Gemini the real job posting instead of the partial/tag-only scraped `description_raw`. Falls back to `description_raw` if page fetch fails or returns less text.

**`candidate_location`** — what Gemini extracts from the real job page:
- Where the **candidate must be**, not the company HQ
- Examples: `"Remote – worldwide"`, `"San Francisco, CA (onsite)"`, `"Remote – US only"`, `"Not specified"`
- Stored as `description_summary.candidate_location` in the DB (JSON field)
- Shown in jobs **table Location column** (replaces scraped value, falls back to scraped if null/"Not specified")
- Shown as **amber card** at top of Requirements tab on job detail page

Cover letter and email draft are **not** generated in the pipeline — generated on-demand via Chat tab in dashboard.

**Contact finding** — same Apollo → Hunter chain as Track A. Skip contact search for `talentweb3` (recruiter aggregator).

---

## Folder structure

```
job-pipeline/
├── pipeline/               ← Python backend (runs daily via GitHub Actions)
│   ├── main.py             ← ORCHESTRATOR — starts here, don't break this
│   ├── config.py           ← All API keys + constants + feature flags (READ THIS FIRST)
│   ├── db.py               ← All Supabase DB operations
│   ├── apollo.py           ← Contact finding (primary)
│   ├── hunter.py           ← Contact finding fallback + email finder + company enrichment
│   ├── generator.py        ← Gemini AI content generation (dual-key fallback)
│   │                          fetch_website_text(url, max_chars=1500) — accepts max_chars param
│   │                          generate_job_content(..., job_page_text="") — uses full page if longer
│   ├── fetchers/           ← Data sources (one file per source)
│   │   ├── cryptorank_scraper.py       ← ONLY Track A source (don't break)
│   │   ├── web3career.py               ← Scrapes /design-jobs (no API key needed)
│   │   ├── cryptojobslist_rss.py
│   │   ├── cryptocurrencyjobs_rss.py
│   │   ├── dragonfly_jobs.py           ← Getro platform
│   │   ├── arbitrum_jobs.py            ← Getro platform
│   │   ├── hashtagweb3.py
│   │   ├── talentweb3.py
│   │   ├── solana_jobs.py              ← Getro platform (added Mar 2026)
│   │   ├── paradigm_jobs.py            ← paradigm.xyz/jobs (added Mar 2026)
│   │   └── sui_jobs.py                 ← Getro platform (added Mar 2026)
│   ├── dedup/              ← Duplicate detection logic
│   ├── filters/            ← Experience + remote scope filtering
│   └── enrichment/
│       ├── twitter_finder.py   ← Cascading Twitter search (Exa → Tavily → Brave)
│       ├── exa_finder.py       ← Exa client pool + company LinkedIn chain
│       └── tavily_finder.py    ← Tavily Twitter + LinkedIn search
│
├── dashboard/              ← Next.js frontend (deployed on Vercel)
│   ├── app/
│   │   ├── layout.tsx      ← Root layout with Sidebar
│   │   ├── funded/page.tsx ← Funded companies table
│   │   ├── jobs/page.tsx   ← Job postings table (10 sources, Location = Gemini candidate_location)
│   │   ├── jobs/[id]/page.tsx  ← Job detail: Requirements tab + Chat tab
│   │   │                          Requirements tab: amber card (candidate_location) + requirements bullets
│   │   └── api/
│   │       ├── reveal-email/route.ts       ← Apollo → Hunter email reveal (server-side)
│   │       ├── generate-content/route.ts   ← On-demand: generate_summary extracts candidate_location
│   │       └── chat/route.ts               ← Gemini streaming chat (GEMINI_API_KEY_CHAT)
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── FundedCompanyCard.tsx
│   │   ├── JobPostingCard.tsx   ← getDisplayLocation() reads candidate_location from description_summary
│   │   ├── ChatPanel.tsx        ← Reusable chat UI, used in job detail tab
│   │   └── CopyButton.tsx
│   └── lib/
│       ├── profile.ts       ← Master profile — feeds ALL Gemini outputs (pipeline + dashboard)
│       ├── supabase.ts
│       └── types.ts
│
├── scripts/
│   └── backfill_candidate_location.py  ← One-off: adds candidate_location to existing DB records
│
├── supabase/               ← DB migration SQL files
├── .env                    ← SECRET — never commit this
├── .env.example            ← Safe template (no real keys)
└── requirements.txt        ← Python dependencies (exa-py>=1.14.0,<2.0.0 — do NOT upgrade to 2.x)
```

---

## Critical rules — DO NOT break these

### 1. Never touch `.env`
All API keys live in `.env` locally and in GitHub Actions secrets. Never commit real keys to git. `.gitignore` already blocks `.env`.

### 2. `GEMINI_ENABLED` flag in `config.py`
```python
GEMINI_ENABLED = True   # ← currently True (dual-key fallback in place)
```
If Gemini is disabled, AI-generated content is skipped — that's intentional. Don't remove the `if GEMINI_ENABLED:` guards.

### 3. `cryptorank_scraper.py` is the ONLY Track A source
RSS sources were removed because they need Gemini to parse. Do not add new RSS sources to Track A unless Gemini is enabled and tested.

### 4. Apollo API
- People search (`/api/v1/mixed_people/api_search`): free, no credits.
- **Email reveal (`/v1/people/match`): costs 1 credit** — only called from dashboard "Find Email" button, never from the pipeline
- Never call `apollo.reveal_email()` in bulk or in automated loops
- The old endpoint `/v1/mixed_people/search` is deprecated (returns 422) — do not revert to it

### 5. Dedup logic is critical
`pipeline/dedup/matcher.py` uses fuzzy matching (RapidFuzz, threshold=85). Don't change the threshold without testing.

### 6. DB schema
Never modify Supabase tables directly without a migration file in `supabase/migrations/`. The dashboard reads specific column names — renaming columns will break the UI.

### 7. Run command
```bash
python3 -m pipeline.main   # use system python3, NOT venv (venv is py3.14 — incompatible)
```

### 8. exa-py version pin
```
exa-py>=1.14.0,<2.0.0   # DO NOT upgrade to 2.x — requires openai, conflicts with google-genai
```

### 9. Track B query is locked
Dashboard always filters `.eq("track", "B")` — never remove this filter.

---

## How the pipeline flows

```
main.py
  ├── Check Apollo credits
  ├── Load all existing companies (for dedup)
  ├── Track A:
  │     cryptorank_scraper.fetch()
  │       → filter by funding amount ($1M–$50M) + round type
  │       → dedup against existing companies
  │       → apollo.find_contact() → hunter.find_contact() fallback
  │       → exa_finder.find_company_linkedin() [Exa → Tavily → Hunter]
  │       → twitter_finder.find_twitter_handle() [Exa → Tavily → Brave]
  │       → [Gemini content if enabled]
  │       → db.insert_funded_lead()
  │
  ├── Track B:
  │     10 fetchers (web3career, cryptojobslist, cryptocurrencyjobs,
  │                  dragonfly, arbitrum, hashtagweb3, talentweb3,
  │                  solana_jobs, paradigm, sui_jobs)
  │       → role keyword filter (must match design titles)
  │       → URL dedup
  │       → experience filter (skip 7+ year roles)
  │       → apollo.find_contact() → hunter.find_contact() fallback
  │       → exa_finder.find_company_linkedin() [Exa → Tavily → Hunter]
  │       → twitter_finder.find_twitter_handle() [Exa → Tavily → Brave]
  │       → fetch_website_text(job_url, max_chars=3000)  ← real job page
  │       → Gemini: requirements_bullets + candidate_location (+ exp/remote if ambiguous)
  │       → db.insert_job_posting()
  │
  ├── Generate follow-ups for 7-day-old records (if Gemini enabled)
  ├── Cleanup records older than 30 days
  └── Update Apollo credit balance in DB
```

---

## Enrichment stack

All enrichment runs for **both Track A and Track B**.

### Contact finding
```
Apollo /mixed_people/api_search (free, no credits)
  ↓ returns None OR throws error
Hunter.io domain-search (free, 25 searches/mo)
```
Hunter fallback triggers on **both** "no result" and Apollo API errors.

### Twitter handle
```
Exa key1 ──(quota error)──▶ Exa key2
    └── no result found ──▶ Tavily ──▶ Brave Search
```

### Company LinkedIn
```
Exa key1 ──(quota error)──▶ Exa key2
    └── no result found ──▶ Tavily ──▶ Hunter /companies/find
```

### Email reveal (on-demand from dashboard only)
```
1. Apollo /people/match (costs 1 credit — needs apollo_person_id)
   ↓ no email or no credits
2. Hunter email-finder with LinkedIn profile URL
   ↓ no email
3. Hunter email-finder with name + domain
   ↓ no email
4. Exa — scan company website pages for email matching domain
```

### Gemini content generation
```
Gemini key1 ──(daily quota exhausted)──▶ Gemini key2
```

> **Fallback philosophy**: Key rotation (key1→key2) happens on quota/errors — same data, extra quota. Source fallback (Exa→Tavily→Brave) happens when previous source finds nothing — different indexes, different coverage.

---

## Dashboard features

### Jobs table (Track B)
- Location column shows **Gemini `candidate_location`** (where candidate must be) — falls back to scraped `job.location` for old records without it
- Filter by application/outreach status
- Company column: Globe (website) + LinkedIn icons
- Source labels: Web3.career, CryptoJobsList, Dragonfly, Arbitrum, #Web3, TalentWeb3, Solana Jobs, Paradigm, Sui Jobs

### Job detail page (`/jobs/[id]`)
- **Requirements tab**:
  - Amber card at top: "Where You'd Need to Be" — Gemini's `candidate_location`
  - Location + Salary cards (if present)
  - 3 key requirements bullets
  - "✨ Analyze Job Posting" button — triggers on-demand Gemini analysis (also extracts `candidate_location`)
- **Chat tab**: Live Gemini chat with job context auto-injected. Supports image/PDF upload. Use this for cover letters, LinkedIn notes, email drafts.

### Funded companies table (Track A)
- Click row → navigates to `/funded/[id]` detail page
- Detail page: Company Overview tab (type, funding, investors, country) + Chat tab
- Company description intentionally removed from the table (visible in overview tab)
- Find Email button on detail page (Apollo → Hunter 4-step chain)

### Shared
- "Find Email" button — Apollo credit first, falls back to Hunter (4-step chain)
- Twitter icon: blue = high confidence, yellow = unverified
- Fixed left sidebar: Funded Companies + Job Postings tabs

---

## description_summary JSON schema

Stored as JSON string in `job_postings.description_summary`. All fields optional/nullable:

```json
{
  "location": "city or remote info from description",
  "salary": "salary range string or null",
  "requirements": ["bullet 1", "bullet 2", "bullet 3"],
  "candidate_location": "Remote – worldwide | San Francisco, CA (onsite) | Not specified | ..."
}
```

`candidate_location` is populated by both:
- Pipeline (via `generate_job_content` with `job_page_text`)
- On-demand dashboard button (`/api/generate-content` → `generate_summary` action)

---

## Tech stack

| Layer | Tech |
|-------|------|
| Pipeline | Python 3, supabase-py, requests, BeautifulSoup, RapidFuzz, exa-py |
| AI generation | Google Gemini `gemini-2.5-flash` (dual-key fallback) |
| Contact finding | Apollo.io (primary) → Hunter.io (fallback) |
| Twitter enrichment | Exa → Tavily → Brave Search (cascading) |
| Company LinkedIn | Exa → Tavily → Hunter /companies/find (cascading) |
| Database | Supabase (Postgres) |
| Dashboard | Next.js 14, Tailwind CSS, Supabase JS |
| Hosting | Vercel (dashboard) + GitHub Actions (pipeline cron) |
| Cron trigger | cron-job.org → GitHub workflow_dispatch (NOT GitHub schedule) |

---

## What's safe to work on

- Dashboard UI changes (components, styling, layout)
- Adding new Track B fetchers (job board scrapers)
- Improving filters in `pipeline/filters/`
- Fixing bugs in existing fetchers
- Adding new enrichment sources to the cascading chain

## What needs extra care

- `pipeline/db.py` — any change here affects all data writes
- `pipeline/dedup/matcher.py` — changing this could cause duplicate records
- `pipeline/apollo.py` — API credits are limited
- `pipeline/enrichment/exa_finder.py` — Exa key pool logic, don't break rotation
- `dashboard/app/funded/page.tsx` and `jobs/page.tsx` — these query Supabase directly
- Any DB schema change — needs migration file + dashboard update together

---

## Known bugs fixed (Mar 16 2026)

### Track A returning 0 new companies every day (silent — no errors logged)

**Root cause 1 — scraper:** `cryptorank_scraper.py` had a hard stage filter. CryptoRank SSR returns `stage: null` for ~75% of rounds. `STAGE_MAP.get(null)` returned None → hard drop. 15/20 companies dropped every run.

**Root cause 2 — main.py:** `process_funded_company()` had its own duplicate stage filter: `if round_type not in ("Pre-Seed", "Seed", "Series A", "Series B"): return`. Even if scraper passed a company through, main.py killed it before contact finding.

**Root cause 3 — DB constraint:** `valid_round` CHECK constraint only allowed 4 values. New round types caused DB insert errors.

**All three fixed Mar 16 2026:**
- Stage filter removed from scraper and main.py entirely
- `round_type` is now a free-text display label, stored as-is (null if CryptoRank doesn't provide it)
- `valid_round` DB constraint dropped — run `ALTER TABLE funded_leads DROP CONSTRAINT valid_round;` if not done already
- Amount ($1M–$50M) is the only hard filter for Track A

### GitHub Actions missing env vars (silent enrichment degradation)

**What happened:** GEMINI_API_KEY_2, EXA_API_KEY, EXA_API_KEY_2, TAVILY_API_KEY, HUNTER_API_KEY were not in the workflow `env:` block. Every daily run fell through to Brave Search directly for all Twitter/LinkedIn enrichment. Pipeline reported `completed` with no errors.

**Fixed Mar 16 2026:** All keys added to workflow. After adding any new API key to config.py, immediately add it to `.github/workflows/daily_pipeline.yml` too.

### SKIP_TIER_KEYWORDS missing "staff product designer"

"Staff Product Designer" was classified as `stretch` instead of `skip` because the list had `"staff designer"` but not `"staff product designer"`. Fixed in `config.py`.

### config.py profile years: 4 → 5

Profile years was 4 in `config.py` but 5 everywhere else (CONTEXT.md, profile.ts). Fixed.

---

## Known bugs fixed (Mar 15 2026)

### React error #31 on funded company detail page (`/funded/[id]`)
**Symptom:** Clicking any company card in Track A crashed with "Objects are not valid as a React child (found: object with keys {key, name})".

**Root cause:** CryptoRank's API returns several fields as objects, not plain strings. Old records in Supabase stored these raw objects:
- `raw_data.funds` → stored as `[{key: "a16z", name: "Andreessen Horowitz"}, ...]` (not `["Andreessen Horowitz", ...]`)
- `raw_data.country` → stored as `{key: "us", name: "United States"}` (not `"United States"`)
- `raw_data.company_type` → added defensive guard (Gemini sets this as a string, but guard prevents future regressions)

**Fix:**
1. `dashboard/app/funded/[id]/page.tsx` — `funds` rendering uses `typeof fund === "string" ? fund : fund.name`. `country` rendering uses same pattern. `companyType` extracted defensively.
2. `dashboard/components/FundedCompanyCard.tsx` — `company_type` rendering in both mobile card + desktop row guarded against object values.
3. `pipeline/fetchers/cryptorank_scraper.py` — `country` now extracted as `c.get("name") if isinstance(c, dict) else c` so future records store plain strings.

**Lesson:** When scraping CryptoRank's `__NEXT_DATA__`, assume any field can be a `{key, name}` object. Always extract `.get("name")` defensively for string fields.

**Mistake in first fix attempt:** Only fixed `funds`, missed `country`. Second deploy still crashed because `raw_data.country` was also an object for old records. Always audit ALL `raw_data` field renders together.

---

## Testing lessons — mistakes made (Mar 16 2026)

### Mistake 1: Unit tests with mocks cannot catch missing CI env vars

**What happened:** GitHub Actions workflow was missing env vars for GEMINI_API_KEY_2, EXA_API_KEY, EXA_API_KEY_2, TAVILY_API_KEY, HUNTER_API_KEY. Pipeline ran daily without the full enrichment chain. All Twitter/LinkedIn lookups fell through to Brave (worst source) silently.

**Why Claude missed it:** Unit tests used `mock.patch` to replace API clients entirely. Mocks pretend keys exist and calls succeed — they never touch `os.getenv()`. Tests passed locally (where `.env` has all keys) but CI never had those keys.

**How to avoid this — if writing tests again:**
1. **Always include an env var smoke test** — before any mocked test, assert that required keys are non-empty strings in the real environment:
   ```python
   def test_required_env_vars_present():
       import os
       required = ["EXA_API_KEY", "TAVILY_API_KEY", "HUNTER_API_KEY", "GEMINI_API_KEY", "GEMINI_API_KEY_2"]
       for key in required:
           assert os.getenv(key), f"Missing required env var: {key}"
   ```
2. **Cross-check workflow file against config.py** — every key loaded via `os.getenv()` in `config.py` must have a corresponding `${{ secrets.KEY_NAME }}` line in `.github/workflows/daily_pipeline.yml`. This is the single most important CI audit step.
3. **Write at least one integration test per enrichment chain** — not mocked, uses real API keys, verifies the full Exa→Tavily→Brave cascade works end-to-end in CI.
4. **After adding any new API key** — immediately update the workflow file. Don't defer it.

**Symptoms of this bug:** Pipeline runs show `errors: []` and `status: completed` but enrichment data (Twitter, LinkedIn, contacts) is missing or low quality. Records save fine — only enrichment is silently degraded.

---

### Mistake 2: CryptoRank stage filter dropping most valid companies (Track A broken silently)

**What happened:** CryptoRank's `__NEXT_DATA__` SSR payload returns `stage: null` for ~75% of funding rounds. The scraper's `STAGE_MAP.get(stage_raw)` hard filter dropped ANY round without a recognized stage string. Out of 20 rounds fetched per run, 15+ were silently dropped. Only 3 passed filters, all 3 already in the DB → `track_a_new: 0, track_a_skipped_dedup: 2` every single day.

**Why nobody noticed:** Pipeline reported `status: completed, errors: []` every day. Dashboard showed 8 companies so it looked populated. `track_a_new: 0` looks normal once a DB is built up. The clue was `skipped_dedup: 2` every run (exact same 2 companies hit dedup every day) — but it's easy to miss in the logs.

**Root cause discovered Mar 16 2026** by running the scraper live and printing every item with its drop reason.

**Fix applied (Mar 16 2026):**
- Stage filter removed as a hard filter — null/unmapped stage now stored as `"Unknown"`, never causes a drop
- Amount filter ($1M–$50M) is now the sole primary filter for Track A
- Stage is metadata only — stored in `round_type` field for display, not for filtering
- Added missing stage mappings: Pre-Series A, Strategic, Private Round, Grant
- Removed broken pagination attempt — CryptoRank SSR ignores `?page=N` and `?offset=N`, always returns the same 20 most-recent rounds. Pagination silently produced 10× duplicates.

**Pagination reality:** `fallbackRounds.total = 10,883` but SSR always serves the same 20. Pipeline runs daily so new companies accumulate naturally. No way to fetch historical rounds via the SSR method without a paid API.

---

## Mandatory testing rules (added Mar 16 2026)

> These rules exist because two separate bugs ran silently in production for weeks without anyone noticing.

### Rule 1: All fetchers and scrapers MUST be tested with real HTTP calls

**Never test a scraper or fetcher with mocked HTTP responses.** Mocks hide the real failure modes:
- The actual response structure changed on the source site
- Fields that exist in your mock don't exist in the real response
- Items that should pass filters are silently dropped

**How to test a fetcher before touching anything else:**
```python
# Run the real fetch and print EVERY item with its pass/fail reason
from pipeline.fetchers.cryptorank_scraper import fetch
results = fetch()
print(f"Total returned: {len(results)}")
for r in results:
    print(f"  {r['announced_date']} | {r['name']} | {r['round_type']} | ${r['funding_amount']:,.0f}")
```

If `len(results)` is suspiciously low (e.g. 0–3 from a source that should return 10–20), **stop and print the raw items with drop reasons before writing any code.** This is exactly how the CryptoRank bug was diagnosed.

### Rule 2: When results are lower than expected — print drop reasons

If a fetcher returns fewer results than expected, run a raw debug pass that prints every item and why it was dropped:
```python
# Debug template — adapt per fetcher
for item in raw_items:
    reasons = []
    if not item.get("name"): reasons.append("no name")
    if stage not in STAGE_MAP: reasons.append(f"stage not mapped [{stage}]")
    if amount < MIN: reasons.append(f"too small [${amount:,.0f}]")
    status = "DROPPED: " + ", ".join(reasons) if reasons else f"PASS [${amount:,.0f}]"
    print(f"  {date} | {name} | {stage} | {status}")
```

### Rule 3: After any pipeline run — verify new counts make sense

After running `python3 -m pipeline.main`, check:
```python
# Quick sanity check
runs = sb.table('pipeline_runs').select('*').order('started_at', desc=True).limit(1).execute()
run = runs.data[0]
print(f"Track A new: {run['track_a_new']}, deduped: {run['track_a_skipped_dedup']}, filtered: {run['track_a_skipped_filter']}")
print(f"Track B new: {run['track_b_new']}, deduped: {run['track_b_skipped_dedup']}, filtered: {run['track_b_skipped_filter']}")
```

Red flags to investigate immediately:
- `track_a_new: 0` AND `track_a_skipped_dedup: 0` → scraper returned nothing, likely broken
- `track_a_new: 0` AND `track_a_skipped_dedup: N` where N is always the same number → all results are deduped, filter may be too strict
- `track_b_new: 0` across multiple consecutive runs → dedup too aggressive or fetchers broken

### Rule 4: Cross-check workflow env vars after ANY new API key is added

Every `os.getenv("KEY_NAME")` in `config.py` must have a matching line in `.github/workflows/daily_pipeline.yml`:
```yaml
env:
  KEY_NAME: ${{ secrets.KEY_NAME }}
```
Missing this causes the enrichment chain to silently degrade. Pipeline still runs, still says completed, but Exa/Tavily/Hunter all fail and Brave (worst source) handles everything.

### Rule 5: Never use mocks for integration tests on this pipeline

Unit mocks are fine for testing pure logic (dedup fuzzy matching, filter thresholds, date parsing). But for anything that touches an external API or scrapes a website — use the real thing. If a test needs a real API call and you're worried about rate limits, use a `@pytest.mark.integration` marker and run them separately. Do not mock the HTTP layer for scraper tests.

---

## Deferred / future work

- Gmail response tracking — monitor inbox, auto-update outreach status when replies come in
- Re-add RSS sources to Track A (TechCrunch, EU Startups etc) when ready
- Salary + visa sponsorship extraction in pipeline Gemini prompt (fields exist in DB, never populated by pipeline — only by on-demand dashboard button)

---

## Contacts

- Owner: Methun (Methun05 on GitHub)
- Production: https://tracker.methun.design
- Repo: https://github.com/Methun05/job-pipeline
