# Job Pipeline — Project Context for Reviewers & AI Agents

> Read this before touching any code. This project is live and runs daily.

---

## What this project does

Automated job search pipeline for a **Product Designer (4 years exp, crypto/web3 UX)** looking for remote roles.

It runs every day at **8 AM IST** and does two things:

- **Track A** — Scrapes recently funded crypto companies → finds a contact person via Apollo → shows in dashboard
- **Track B** — Fetches crypto job postings → filters for design roles → shows in dashboard

Results appear at **https://tracker.methun.design** (live production dashboard).

---

## Folder structure

```
job-pipeline/
├── pipeline/               ← Python backend (runs daily via GitHub Actions)
│   ├── main.py             ← ORCHESTRATOR — starts here, don't break this
│   ├── config.py           ← All constants + feature flags (READ THIS FIRST)
│   ├── db.py               ← All Supabase DB operations
│   ├── apollo.py           ← Contact finding via Apollo API
│   ├── generator.py        ← Gemini AI content generation
│   ├── fetchers/           ← Data sources (one file per source)
│   │   ├── cryptorank_scraper.py   ← ONLY Track A source (don't break)
│   │   ├── web3career.py
│   │   ├── cryptojobslist_rss.py
│   │   ├── cryptocurrencyjobs_rss.py
│   │   └── ...more fetchers
│   ├── dedup/              ← Duplicate detection logic
│   ├── filters/            ← Experience + remote scope filtering
│   └── enrichment/
│       └── twitter_finder.py  ← Brave Search → finds Twitter handles
│
├── dashboard/              ← Next.js frontend (deployed on Vercel)
│   ├── app/
│   │   ├── layout.tsx      ← Root layout with Sidebar
│   │   ├── funded/page.tsx ← Funded companies table
│   │   └── jobs/page.tsx   ← Job postings table
│   └── components/
│       ├── Sidebar.tsx
│       ├── FundedCompanyCard.tsx
│       └── JobPostingCard.tsx
│
├── supabase/               ← DB migration SQL files
├── .env                    ← SECRET — never commit this
├── .env.example            ← Safe template (no real keys)
└── requirements.txt        ← Python dependencies
```

---

## Critical rules — DO NOT break these

### 1. Never touch `.env`
All API keys live in `.env` locally and in GitHub Actions secrets. Never commit real keys to git. `.gitignore` already blocks `.env`.

### 2. `GEMINI_ENABLED` flag in `config.py`
```python
GEMINI_ENABLED = True   # ← currently True (Gemini credits available)
```
If Gemini is disabled, AI-generated content (cover letters, email drafts, LinkedIn notes) is skipped — that's intentional. Don't remove the `if GEMINI_ENABLED:` guards.

### 3. `cryptorank_scraper.py` is the ONLY Track A source
RSS sources were removed because they need Gemini to parse. Do not add new RSS sources to Track A unless Gemini is enabled and tested.

### 4. Apollo free tier limits
- People search: unlimited
- **Email reveal: costs 1 credit** — the dashboard has a "Find Email" button that triggers this
- Never call `apollo.reveal_email()` in bulk or in automated loops

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
  │       → apollo.find_contact()
  │       → twitter_finder.find_twitter_handle()
  │       → [Gemini content if enabled]
  │       → db.insert_funded_lead()
  │
  ├── Track B:
  │     7 fetchers (web3career, cryptojobslist, etc.)
  │       → role keyword filter (must match design titles)
  │       → URL dedup
  │       → experience filter (skip 7+ year roles)
  │       → apollo.find_contact()
  │       → twitter_finder.find_twitter_handle()
  │       → [Gemini content if enabled]
  │       → db.insert_job_posting()
  │
  ├── Generate follow-ups for 7-day-old records (if Gemini enabled)
  ├── Cleanup records older than 30 days
  └── Update Apollo credit balance in DB
```

---

## Dashboard features

- Fixed left sidebar: Funded Companies + Job Postings tabs
- Filter by outreach status
- Expand any row to see: message draft, cover letter, email draft, notes
- "Find Email" button — uses Apollo credit, reveals email for that contact
- Twitter icon: blue = verified handle, yellow = unverified

---

## Tech stack

| Layer | Tech |
|-------|------|
| Pipeline | Python 3, supabase-py, requests, BeautifulSoup, RapidFuzz |
| AI generation | Google Gemini (`gemini-2.5-flash`) |
| Contact finding | Apollo.io API |
| Twitter enrichment | Brave Search API |
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

## What needs extra care

- `pipeline/db.py` — any change here affects all data writes
- `pipeline/dedup/matcher.py` — changing this could cause duplicate records
- `pipeline/apollo.py` — API credits are limited
- `dashboard/app/funded/page.tsx` and `jobs/page.tsx` — these query Supabase directly
- Any DB schema change — needs migration file + dashboard update together

---

## Contacts

- Owner: Methun (Methun05 on GitHub)
- Production: https://tracker.methun.design
- Repo: https://github.com/Methun05/job-pipeline
