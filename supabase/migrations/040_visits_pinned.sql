-- ============================================================
-- Migration 040 — Visits: manuell «Vis på TV»-pin
--
-- Velkomst-slide F injiseres normalt i TV-rotasjonen kun mens et
-- besøk er innenfor sitt automatiske vindu (60 min før start →
-- 15 min etter slutt). `pinned` lar admin overstyre dette: et
-- pinnet besøk regnes som aktiv velkomst HELE den dagen det er
-- datert, uavhengig av klokkeslett — så resepsjonen kan løfte en
-- velkomst opp på skjermen med én gang den er klar.
--
-- Realtime er allerede på `visits` (migration 020), så en UPDATE
-- av `pinned` propagerer til reception-TV-en uten ekstra oppsett.
-- ============================================================

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
