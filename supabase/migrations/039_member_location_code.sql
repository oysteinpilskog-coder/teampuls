-- ============================================================
-- Migration 039 — Member.location_code
--
-- Eksplisitt per-medlem lokasjon for lokasjon-badgen i Oversikt,
-- Sommer og TV-dashboard. Tidligere ble NO/UK avledet fra
-- home_office_id → offices.country_code, noe som ga inkonsistent
-- badge (medlemmer uten kontor fikk ingen badge, og Sommer/Oversikt
-- kunne sprike). Nå settes lokasjon direkte på medlemmet.
--
-- Kun to verdier: 'GB' (vises som «UK») og 'NO'. NOT NULL med
-- DEFAULT 'NO' — alle får NO med mindre noe annet velges, jf.
-- «UK skal ha UK, og resten NO».
--
-- Backfill: medlemmer hvis home_office ligger i et GB-kontor får
-- 'GB', resten beholder default 'NO'. Idempotent.
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS location_code TEXT NOT NULL DEFAULT 'NO'
    CHECK (location_code IN ('NO', 'GB'));

UPDATE members m
SET location_code = 'GB'
FROM offices o
WHERE m.home_office_id = o.id
  AND o.country_code = 'GB'
  AND m.location_code <> 'GB';
