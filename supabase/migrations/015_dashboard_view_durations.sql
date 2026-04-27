-- ============================================================
-- Migration 015 — Per-view auto-rotation durations
--
-- Replaces the URL-only `?interval=` knob with a Settings-driven
-- per-view dwell time. JSONB so we can extend with new view keys
-- without another migration.
--
-- Defaults match the brand spec:
--   A (Nå)       30s
--   B (Uken)     20s
--   C (Kontorer) 15s
--   D (Kunder)   15s
--   E (Årshjul)  20s
--
-- Client coerces missing keys to the default for that view, so an
-- old payload (or a partial UI write) won't break rotation.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dashboard_view_durations JSONB
    NOT NULL DEFAULT '{"A":30,"B":20,"C":15,"D":15,"E":20}'::JSONB;
