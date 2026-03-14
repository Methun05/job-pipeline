# Job Pipeline — Project Context for Reviewers & AI Agents

> Read this before touching any code. This project is live and runs daily.

---

## What this project does

Automated job search pipeline for a **Product Designer (4 years exp, crypto/web3 UX)** looking for remote roles.

It runs every day at **8 AM IST** and does two things:

- **Track A** — Scrapes recently funded crypto companies → finds a contact person via Apollo → enriches with Twitter + LinkedIn → shows in dashboard
- **Track B** — Fetches crypto job postings → filters for design roles → enriches company data → shows in dashboard

Results appear at **https://tracker.methun.design** (live production dashboard).

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

### 4. Apollo free tier limits
- People search: unlimited
- **Email reveal: costs 1 credit** — the dashboard has a "Find Email" button that triggers this
- Never call `apollo.reveal_email()` in bulk or in automated loops
- Email reveal falls back to Hunter.io if Apollo finds nothing

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
Apollo.io → Hunter.io domain search (fallback when Apollo finds nothing)
```

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
Apollo /people/match ──▶ Hunter email-finder
```

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
