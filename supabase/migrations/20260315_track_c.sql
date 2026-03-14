-- Track C: General product design roles
-- Adds visa_sponsorship flag and track identifier to job_postings

ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS visa_sponsorship BOOLEAN DEFAULT FALSE;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS track TEXT DEFAULT 'B';
