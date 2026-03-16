-- Expand valid_round constraint on funded_leads.
-- Old constraint: Pre-Seed, Seed, Series A, Series B only.
-- CryptoRank SSR returns null stage for ~75% of rounds — stage is now metadata only,
-- not a hard filter. Added: Pre-Series A, Series C, Strategic, Private Round, Grant, Unknown.

ALTER TABLE funded_leads
  DROP CONSTRAINT valid_round;

ALTER TABLE funded_leads
  ADD CONSTRAINT valid_round CHECK (round_type IN (
    'Pre-Seed',
    'Seed',
    'Pre-Series A',
    'Series A',
    'Series B',
    'Series C',
    'Strategic',
    'Private Round',
    'Grant',
    'Unknown'
  ));
