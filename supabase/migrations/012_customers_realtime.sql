-- ============================================================
-- Migration 012 — Enable Realtime for customers
--
-- The dashboard (/dashboard view D, customer map) subscribes to
-- postgres_changes on the customers table so that adding a
-- customer in settings shows up on the TV wall without a reload.
-- Without the table being in the supabase_realtime publication,
-- the subscription silently receives nothing.
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
      AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  END IF;
END $$;
