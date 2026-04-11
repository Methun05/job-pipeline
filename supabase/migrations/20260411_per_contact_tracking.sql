-- Per-contact email outreach tracking
-- Allows multiple contacts per company to be emailed independently

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_status       TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS outreach_email     TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_thread_id    TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_sent_at  TIMESTAMPTZ;

-- email_status values: 'none' | 'sent' | 'replied' | 'followed_up'

COMMENT ON COLUMN contacts.email_status IS 'none | sent | replied | followed_up';
