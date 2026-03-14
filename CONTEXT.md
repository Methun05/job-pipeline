# Job Pipeline — Project Context for Reviewers & AI Agents

> Read this before touching any code. This project is live and runs daily.

---

## Why this exists

Job hunting manually is slow. This pipeline automates two specific strategies for a **Product Designer (4 years exp, crypto/web3 UX)** looking for remote roles:

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

**Sources (7 total):**
- web3.career (scraper — /design-jobs page, no API key)
- cryptojobslist (RSS)
- cryptocurrencyjobs (RSS)
- dragonfly (scraper)
- arbitrum (scraper)
- hashtagweb3 (scraper)
- talentweb3 (recruiter aggregator)

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

**Gemini extracts** (per job): location, salary, 3 key requirements bullets. Cover letter and email draft are **not** generated in the pipeline (would burn too much Gemini quota) — generated on-demand from dashboard.

**Contact finding** — same Apollo → Hunter chain as Track A. Skip contact search for `talentweb3` (it's a recruiter aggregator, company_name is the platform, not the hiring company).

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
│   ├── fetchers/           ← Data sources (one file per source)
│   │   ├── cryptorank_scraper.py       ← ONLY Track A source (don't break)
│   │   ├── web3career.py               ← Scrapes /design-jobs (no API key needed)
│   │   ├── cryptojobslist_rss.py
│   │   ├── cryptocurrencyjobs_rss.py
│   │   ├── dragonfly_jobs.py
│   │   ├── arbitrum_jobs.py
│   │   ├── hashtagweb3.py
│   │   └── talentweb3.py
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
│   │   ├── jobs/page.tsx   ← Job postings table
│   │   └── api/
│   │       └── reveal-email/route.ts  ← Apollo → Hunter email reveal (server-side)
│   └── components/
│       ├── Sidebar.tsx
│       ├── FundedCompanyCard.tsx
│       └── JobPostingCard.tsx  ← Shows Globe + LinkedIn icons per company
│
├── supabase/               ← DB migration SQL files
├── .env                    ← SECRET — never commit this
├── .env.example            ← Safe template (no real keys)
└── requirements.txt        ← Python dependencies (includes exa-py)
```

---

## Critical rules — DO NOT break these

### 1. Never touch `.env`
All API keys live in `.env` locally and in GitHub Actions secrets. Never commit real keys to git. `.gitignore` already blocks `.env`.

### 2. `GEMINI_ENABLED` flag in `config.py`
```python
GEMINI_ENABLED = True   # ← currently True (dual-key fallback in place)
```
If Gemini is disabled, AI-generated content (cover letters, email drafts, LinkedIn notes) is skipped — that's intentional. Don't remove the `if GEMINI_ENABLED:` guards.

### 3. `cryptorank_scraper.py` is the ONLY Track A source
RSS sources were removed because they need Gemini to parse. Do not add new RSS sources to Track A unless Gemini is enabled and tested.

### 4. Apollo API
- People search (`/api/v1/mixed_people/api_search`): free, no credits. Note: free tier returns no results for many small companies — Hunter fallback handles this.
- **Email reveal (`/v1/people/match`): costs 1 credit** — only called from the dashboard "Find Email" button, never from the pipeline
- Never call `apollo.reveal_email()` in bulk or in automated loops
- The old endpoint `/v1/mixed_people/search` is deprecated (returns 422) — do not revert to it

### 5. Dedup logic is critical
`pipeline/dedup/matcher.py` uses fuzzy matching (RapidFuzz, threshold=85) to avoid inserting the same company twice. Don't change the threshold without testing.

### 6. DB schema
Never modify Supabase tables directly without a migration file in `supabase/migrations/`. The dashboard reads specific column names — renaming columns will break the UI.

### 7. Run command
```bash
python3 -m pipeline.main   # use system python3, NOT venv (venv is py3.14 — incompatible)
```

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
  │     7 fetchers (web3career, cryptojobslist, etc.)
  │       → role keyword filter (must match design titles)
  │       → URL dedup
  │       → experience filter (skip 7+ year roles)
  │       → apollo.find_contact() → hunter.find_contact() fallback
  │       → exa_finder.find_company_linkedin() [Exa → Tavily → Hunter]
  │       → twitter_finder.find_twitter_handle() [Exa → Tavily → Brave]
  │       → [Gemini content if enabled]
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
Note: Hunter domain-search (step in contact finding) often returns email directly at no cost — check `_hunter_email` before triggering reveal.

### Gemini content generation
```
Gemini key1 ──(daily quota exhausted)──▶ Gemini key2
```

> **Fallback philosophy**: Key rotation (key1→key2) happens on quota/errors only — same data, extra quota. Source fallback (Exa→Tavily→Brave) happens when the previous source finds nothing — different indexes, different coverage.

---

## Dashboard features

- Fixed left sidebar: Funded Companies + Job Postings tabs
- Filter by outreach/application status
- Company column shows Globe (website) + LinkedIn icons — populated automatically by enrichment
- Expand any row to see: message draft, cover letter, email draft, notes
- "Find Email" button — uses Apollo credit first, falls back to Hunter
- Twitter icon: blue = high confidence, yellow = unverified

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

## Contacts

- Owner: Methun (Methun05 on GitHub)
- Production: https://tracker.methun.design
- Repo: https://github.com/Methun05/job-pipeline
