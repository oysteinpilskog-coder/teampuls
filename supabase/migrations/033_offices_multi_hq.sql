-- ============================================================
-- Migration 033 — Tillat flere HQ per org.
--
-- Original 024 antok ett enkelt hovedkontor per organisasjon
-- og håndhevet det via partial unique index. CalWin (og typisk
-- multinasjonale kunder) har regionale hovedkontorer — Nordic
-- + UK i dette tilfellet. Vi dropper unique-constraintet og
-- beholder is_hq som en ren flagg-kolonne: 0, 1, eller flere
-- offices kan være HQ.
--
-- Versjonen: PR #268 landet originalt som 031, men kolliderte
-- med to andre 031-er (customer_split som ble prod-31, og
-- rename_sick_to_absent som ble bumpet til 032). Renumrert
-- til 033 så supabase-CLI får én entydig versjon per migrering.
--
-- Ingen datakonvertering nødvendig — eksisterende rader med
-- is_hq = TRUE forblir gyldige.
-- ============================================================

DROP INDEX IF EXISTS offices_one_hq_per_org;

-- Indeks som hjelper de stedene i UI som filtrerer på is_hq
-- (hero-tellinger, kart-sortering). Partial index holder den
-- liten siden de fleste rader er FALSE.
CREATE INDEX IF NOT EXISTS offices_hq_lookup
  ON offices (org_id) WHERE is_hq = TRUE;
