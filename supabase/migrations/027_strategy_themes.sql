-- ============================================================
-- Migration 027 — Strategy themes (årshjul for strategi)
--
-- Et strategi-årshjul deler året i fire kvartaler. Hver
-- kvartal har ett tema med et mål og en status. Dette er en
-- enklere modell enn 'events' (ingen datoer, faste fire rader
-- per år) og holdes derfor i sin egen tabell.
--
-- Datamodell:
--   org_id     uuid     — RLS-skopet
--   year       integer  — kalenderår (f.eks. 2026)
--   quarter    integer  — 1..4
--   title      text     — kort tema-overskrift
--   goal       text     — fritekst-beskrivelse av målet (kan være tomt)
--   status     text     — 'on_track' | 'at_risk' | 'off_track' | 'done'
--
-- UNIQUE(org_id, year, quarter) — ett tema per kvartal per år.
-- UPSERT er trivielt fra UI-en.
--
-- Per-organization toggle:
--   strategies_enabled BOOLEAN, default TRUE — kill switch for hele
--   surface-en (samme mønster som birthdays_enabled / anniversaries_enabled).
-- ============================================================

CREATE TABLE IF NOT EXISTS strategy_themes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  year integer NOT NULL,
  quarter integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),

  title text NOT NULL DEFAULT '',
  goal text,
  status text NOT NULL DEFAULT 'on_track'
    CHECK (status IN ('on_track', 'at_risk', 'off_track', 'done')),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, year, quarter)
);

CREATE INDEX IF NOT EXISTS idx_strategy_themes_org_year
  ON strategy_themes(org_id, year);

CREATE TRIGGER set_strategy_themes_updated_at
  BEFORE UPDATE ON strategy_themes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE strategy_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategy_themes_read ON strategy_themes FOR SELECT
  USING (org_id = ANY(current_user_org_ids()));

CREATE POLICY strategy_themes_write ON strategy_themes FOR ALL
  USING (current_user_is_admin(org_id))
  WITH CHECK (current_user_is_admin(org_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'strategy_themes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE strategy_themes;
  END IF;
END $$;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS strategies_enabled BOOLEAN NOT NULL DEFAULT TRUE;
