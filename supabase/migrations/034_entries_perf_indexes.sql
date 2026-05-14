-- Hot-path indexes for the entries table.
--
-- The unique constraint UNIQUE(org_id, member_id, date) gives us a btree on
-- the leading prefix (org_id) and the full triple — but the matrix's primary
-- query is `WHERE org_id IN (...) AND date IN (...)`, which scans on
-- (org_id, date) without member_id. Without a dedicated index Postgres
-- falls back to a bitmap heap scan once the entries table grows past a
-- few thousand rows per org, which is exactly the moment the user starts
-- to feel the matrix lag.
--
-- The cell-editor's "find contiguous span" lookup queries
-- `WHERE org_id = ? AND member_id = ? AND date BETWEEN ? AND ?` — covered
-- by the unique index — but `/sommer` and `my-plan` issue
-- `WHERE member_id = ? AND date BETWEEN ?` across orgs, which benefits
-- from a (member_id, date) index that doesn't lead with org_id.

CREATE INDEX IF NOT EXISTS idx_entries_org_date
  ON entries(org_id, date);

CREATE INDEX IF NOT EXISTS idx_entries_member_date
  ON entries(member_id, date);

-- Visits are filtered by (org_id, date) too — the matrix' guests rail and
-- dashboard "today" widgets both hit this. 020_visits already adds
-- idx_visits_org_date so we're good there.
--
-- ai_corrections is read 20-rows-at-a-time via order-by-created_at.
-- 013_ai_events_and_corrections adds idx_ai_corrections_org_created.
