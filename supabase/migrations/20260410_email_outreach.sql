-- Email outreach columns for funded_leads
-- Adds email sending state without touching existing funded_status enum

ALTER TABLE funded_leads
  ADD COLUMN IF NOT EXISTS outreach_email       text,
  ADD COLUMN IF NOT EXISTS email_status         text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS email_sent_at        timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_thread_id      text,
  ADD COLUMN IF NOT EXISTS email_permutation_idx integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follow_up_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS credibility_score    integer,
  ADD COLUMN IF NOT EXISTS credibility_reason   text;

-- email_status values: 'none' | 'sent' | 'bounced' | 'followed_up' | 'not_found'

-- Email permutations on contacts (for bounce retry)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_permutations JSONB DEFAULT '[]'::jsonb;

-- Allow anon (dashboard) to update new columns
-- (existing anon_update_funded policy covers all columns via USING true)
