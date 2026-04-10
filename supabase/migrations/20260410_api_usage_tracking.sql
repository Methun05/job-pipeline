-- Add API usage and fallback event tracking to pipeline_runs
-- api_usage: per-service call counts + active key
-- fallback_events: chronological log of source/key fallbacks

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS api_usage       JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fallback_events JSONB DEFAULT '[]'::jsonb;
