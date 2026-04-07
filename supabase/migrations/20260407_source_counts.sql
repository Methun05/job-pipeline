-- Add per-source fetch counts to pipeline_runs for source health monitoring
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS source_counts JSONB DEFAULT '{}'::jsonb;
