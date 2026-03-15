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
- Funding amount: **$1M – $50M** (too small = no design team yet, too large = already fully staffed)
- Round types: **Pre-Seed, Seed, Series A, Series B** only (later rounds = harder to get in early)
- Date window: **last 45 days** — older than that, the moment has passed

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

## Deferred / future work

- Gmail response tracking — monitor inbox, auto-update outreach status when replies come in
- Re-add RSS sources to Track A (TechCrunch, EU Startups etc) when ready
- Salary + visa sponsorship extraction in pipeline Gemini prompt (fields exist in DB, never populated by pipeline — only by on-demand dashboard button)

---

## Contacts

- Owner: Methun (Methun05 on GitHub)
- Production: https://tracker.methun.design
- Repo: https://github.com/Methun05/job-pipeline
