-- ─────────────────────────────────────────────────────────────────────────────
-- Job Pipeline — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. COMPANIES (shared across both tracks) ──────────────────────────────────
CREATE TABLE companies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  domain         TEXT UNIQUE,        -- normalized: cryptox.io (no www, no scheme)
  website        TEXT,
  description    TEXT,               -- Groq summary, null if website unreachable
  employee_count INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_companies_name   ON companies(name);

-- ── 2. CONTACTS (from Apollo People Search) ───────────────────────────────────
CREATE TABLE contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  apollo_person_id  TEXT UNIQUE,      -- prevents re-inserting same person
  name              TEXT NOT NULL,
  title             TEXT,
  linkedin_url      TEXT,
  seniority         TEXT,             -- executive | director | manager | individual
  email             TEXT,             -- NULL until revealed via dashboard button
  email_revealed    BOOLEAN NOT NULL DEFAULT false,
  email_revealed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_company ON contacts(company_id);

-- ── 3. FUNDED LEADS (Track A) ─────────────────────────────────────────────────
CREATE TABLE funded_leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id),

  -- Source & funding details
  source              TEXT NOT NULL,    -- cryptorank | techcrunch | eu_startups
  funding_amount      NUMERIC,          -- always stored in USD
  funding_currency    TEXT DEFAULT 'USD',
  round_type          TEXT,
  announced_date      DATE,

  -- AI-generated content
  linkedin_note       TEXT,
  email_draft         TEXT,
  follow_up_message   TEXT,             -- generated at 7-day mark by pipeline

  -- Status tracking
  status              TEXT NOT NULL DEFAULT 'new',
  last_action_at      TIMESTAMPTZ,
  follow_up_generated BOOLEAN NOT NULL DEFAULT false,

  notes               TEXT,
  raw_data            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_funded_status CHECK (status IN (
    'new','connection_sent','connected','replied','interview','closed','skipped','cant_find'
  )),
  CONSTRAINT valid_round CHECK (round_type IN (
    'Pre-Seed','Seed','Series A','Series B'
  ))
);

CREATE INDEX idx_funded_status        ON funded_leads(status);
CREATE INDEX idx_funded_date          ON funded_leads(announced_date DESC);
CREATE INDEX idx_funded_last_action   ON funded_leads(last_action_at);
CREATE INDEX idx_funded_company       ON funded_leads(company_id);

-- ── 4. JOB POSTINGS (Track B) ─────────────────────────────────────────────────
CREATE TABLE job_postings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id                 UUID REFERENCES contacts(id),

  -- Job details
  source                     TEXT NOT NULL,
  job_title                  TEXT NOT NULL,
  job_url                    TEXT NOT NULL UNIQUE,   -- primary dedup key
  description_raw            TEXT,
  description_summary        TEXT,                   -- 3 bullet points, Groq
  salary_min                 NUMERIC,
  salary_max                 NUMERIC,
  salary_currency            TEXT DEFAULT 'USD',
  posted_at                  TIMESTAMPTZ,

  -- Filters
  remote_scope               TEXT NOT NULL DEFAULT 'unclear',
  experience_match           TEXT NOT NULL DEFAULT 'strong',
  years_min                  INT,
  years_max                  INT,

  -- AI-generated content
  cover_letter               TEXT,
  linkedin_note              TEXT,
  email_draft                TEXT,
  follow_up_message          TEXT,

  -- Application status (tracked independently from outreach)
  application_status         TEXT NOT NULL DEFAULT 'new',
  application_last_action_at TIMESTAMPTZ,

  -- Outreach status
  outreach_status            TEXT NOT NULL DEFAULT 'new',
  outreach_last_action_at    TIMESTAMPTZ,

  follow_up_generated        BOOLEAN NOT NULL DEFAULT false,
  notes                      TEXT,
  raw_data                   JSONB,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_remote    CHECK (remote_scope IN ('global','us_only','unclear')),
  CONSTRAINT valid_exp_match CHECK (experience_match IN ('strong','stretch')),
  CONSTRAINT valid_app_status CHECK (application_status IN (
    'new','applied','follow_up','interview','offer','rejected','skipped'
  )),
  CONSTRAINT valid_out_status CHECK (outreach_status IN (
    'new','connection_sent','connected','replied','conversation','cant_find'
  ))
);

CREATE INDEX idx_jobs_app_status    ON job_postings(application_status);
CREATE INDEX idx_jobs_out_status    ON job_postings(outreach_status);
CREATE INDEX idx_jobs_posted_at     ON job_postings(posted_at DESC);
CREATE INDEX idx_jobs_app_action    ON job_postings(application_last_action_at);
CREATE INDEX idx_jobs_out_action    ON job_postings(outreach_last_action_at);
CREATE INDEX idx_jobs_company       ON job_postings(company_id);

-- ── 5. PIPELINE RUNS (observability) ─────────────────────────────────────────
CREATE TABLE pipeline_runs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at             TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'running',
  track_a_new              INT DEFAULT 0,
  track_a_skipped_dedup    INT DEFAULT 0,
  track_a_skipped_filter   INT DEFAULT 0,
  track_b_new              INT DEFAULT 0,
  track_b_skipped_dedup    INT DEFAULT 0,
  track_b_skipped_filter   INT DEFAULT 0,
  apollo_credits_remaining INT,
  errors                   JSONB DEFAULT '[]'::jsonb
);

-- ── 6. SETTINGS (key-value, for Apollo credits + misc config) ─────────────────
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (key, value) VALUES
  ('apollo_credits_remaining', '100'),
  ('apollo_credits_updated_at', now()::text);

-- ── 7. UPDATED_AT auto-trigger ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_funded_updated_at
  BEFORE UPDATE ON funded_leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON job_postings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 8. ROW LEVEL SECURITY ─────────────────────────────────────────────────────
ALTER TABLE companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE funded_leads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings      ENABLE ROW LEVEL SECURITY;

-- Anon key (used by Next.js dashboard) can read everything
CREATE POLICY "anon_read_companies"     ON companies     FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_contacts"      ON contacts      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_funded"        ON funded_leads  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_jobs"          ON job_postings  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_pipeline_runs" ON pipeline_runs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_settings"      ON settings      FOR SELECT TO anon USING (true);

-- Anon key can update status/notes (dashboard actions)
CREATE POLICY "anon_update_funded"   ON funded_leads  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_jobs"     ON job_postings  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_contacts" ON contacts      FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_settings" ON settings      FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Service role key (used by pipeline) bypasses RLS automatically — no policy needed
