-- Twitter/X job lead tracker
-- Completely isolated — no FKs to companies/contacts

CREATE TABLE IF NOT EXISTS twitter_leads (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tweet_url        text UNIQUE NOT NULL,
    tweet_text       text,
    posted_at        timestamptz,
    poster_handle    text,
    poster_name      text,
    poster_bio       text,
    poster_followers integer,
    poster_type      text,           -- 'founder' | 'company' | 'unknown'
    company_name     text,
    role_mentioned   text,
    gemini_confidence float,
    status           text DEFAULT 'new',  -- new | messaged | replied | skipped
    notes            text,
    created_at       timestamptz DEFAULT now()
);

-- Fast lookups by status for dashboard filtering
CREATE INDEX IF NOT EXISTS twitter_leads_status_idx ON twitter_leads (status);
CREATE INDEX IF NOT EXISTS twitter_leads_posted_at_idx ON twitter_leads (posted_at DESC);
