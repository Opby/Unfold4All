-- FR12: per-answer PAI metrics (framing tags, semantic shifts, divergence)
-- logged alongside the existing tier mix. See specs/slice-4-metrics.md.
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS metrics jsonb;
