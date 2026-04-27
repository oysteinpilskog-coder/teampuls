-- ============================================================
-- Migration 016 — Birthdays and work anniversaries
--
-- Distributed teams forget each other. We surface birthdays and
-- work anniversaries this week / today so colleagues can mark them.
-- Privacy is not optional — every personal date is opt-in.
--
-- Per-member columns
--   birth_date              DATE, nullable
--   start_date              DATE, nullable (employment start)
--   birthday_visible        BOOLEAN, default FALSE — bursdager er sensitive
--   anniversary_visible     BOOLEAN, default TRUE  — jobbjubileum er offentlig
--
-- Per-organization toggles let an admin disable the feature
-- globally for the whole workspace.
--   birthdays_enabled       BOOLEAN, default TRUE
--   anniversaries_enabled   BOOLEAN, default TRUE
--
-- Indexes are on (month, day) — that's how we look up "this week"
-- without dragging the year along. Partial WHERE clauses keep the
-- index lean: only members who have opted in and have a date set.
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS birthday_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anniversary_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS birthdays_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS anniversaries_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS members_birth_date_idx
  ON members ((EXTRACT(MONTH FROM birth_date)), (EXTRACT(DAY FROM birth_date)))
  WHERE birth_date IS NOT NULL AND birthday_visible = TRUE;

CREATE INDEX IF NOT EXISTS members_start_date_idx
  ON members ((EXTRACT(MONTH FROM start_date)), (EXTRACT(DAY FROM start_date)))
  WHERE start_date IS NOT NULL AND anniversary_visible = TRUE;
