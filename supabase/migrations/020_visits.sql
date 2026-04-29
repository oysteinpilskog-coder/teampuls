-- ============================================================
-- Migration 020 — Visits (Welcome mode)
--
-- Reception-TV velkomst-slide vises kun for et registrert
-- besøk MED klokkeslett. "Streng modell" håndheves i schemaet:
-- start_time NOT NULL betyr at det er umulig å lagre et besøk
-- uten et tidspunkt. Uten tid → ingen velkomst, ingen unntak.
--
-- entries-tabellen kunne ikke utvides til formålet:
--   - UNIQUE(org_id, member_id, date) → kun én entry per
--     medlem per dag (en host kan ha både kontordag + besøk)
--   - mangler felt for besøkende-navn / firma
--
-- AI-parseren utvides til å detektere besøks-mønstre
-- ("Anna Hansen kommer 14:00 i morgen for møte med Johan").
-- ============================================================

CREATE TABLE visits (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Vert (ansatt som tar imot). Settes alltid til et registrert
  -- medlem; ON DELETE CASCADE rydder opp hvis vert deaktiveres
  -- og slettes — vi vil ikke ha foreldreløse besøk på TV-en.
  host_member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,

  -- Den besøkende. Vises stort på TV-en — derfor NOT NULL.
  visitor_name    text NOT NULL,
  -- Firmanavn er valgfritt; vises som «fra Acme AS» kun når satt.
  visitor_company text,

  date            date NOT NULL,
  -- STRENG MODELL: ingen velkomst uten klokkeslett.
  start_time      time NOT NULL,
  end_time        time,

  note            text,

  -- Innleggings-kanal — speiler entries.source for konsistens.
  source          text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_web', 'ai_email')),
  source_text     text,
  -- AI-confidence 0..1. NULL for manuelle innlegginger.
  confidence      numeric,

  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Dashboard-spørringen er alltid (org_id, date=today). Egen indeks
-- så det skalerer når en org får tusenvis av historiske besøk.
CREATE INDEX idx_visits_org_date ON visits(org_id, date);

CREATE TRIGGER set_visits_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: alle medlemmer i orgen kan lese OG skrive besøk. Besøk
-- er operasjonell info (resepsjons-koordinasjon), ikke sensitive
-- som kunde-adresser eller medlems-roller — så vi følger samme
-- mønster som entries (alle medlemmer kan skrive), ikke customers
-- (admin-only).
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY visits_read ON visits FOR SELECT
  USING (org_id = ANY(current_user_org_ids()));

CREATE POLICY visits_write ON visits FOR ALL
  USING (org_id = ANY(current_user_org_ids()))
  WITH CHECK (org_id = ANY(current_user_org_ids()));

-- Realtime: dashboardet abonnerer på postgres_changes for å vise
-- nye besøk uten å måtte refreshe TV-en. Idempotent guard så det
-- er trygt å re-kjøre migrasjonen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'visits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE visits;
  END IF;
END $$;
