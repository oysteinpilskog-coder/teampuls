-- ============================================================
-- Migration 036 — Enable Realtime for organizations
--
-- The dashboard (/dashboard) reads admin-controlled settings off
-- the organizations row: dashboard_rotation_views,
-- dashboard_view_durations, default_presence_assumption, name and
-- logo_url. Until now the TV wall only picked up changes to these
-- on a full reload — an admin editing the rotation cadence on their
-- own PC had no way to push it to the reception screen live.
--
-- Adding organizations to the supabase_realtime publication lets the
-- dashboard subscribe to postgres_changes on its own org row, so
-- "Admin decides → every screen updates" happens instantly.
--
-- Idempotent: safe to re-run if the table is already in the
-- publication.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'organizations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE organizations;
  END IF;
END $$;
