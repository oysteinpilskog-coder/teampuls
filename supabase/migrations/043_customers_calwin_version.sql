-- ============================================================
-- Migration 043 — CalWin-versjon per kunde
--
-- Nøkkeltall måler migreringen fra CalWin 7 til CalWin 8. Hver
-- kunde merkes med hvilken versjon den kjører. Alle skal over til 8
-- etter hvert, så 7 er utgangspunktet: eksisterende kunder får 7, og
-- de som allerede er migrert flippes til 8 i Innstillinger → Kunder.
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS calwin_version SMALLINT NOT NULL DEFAULT 7
    CHECK (calwin_version IN (7, 8));
