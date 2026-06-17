-- ============================================================
-- Migration 041 — Visits: gjør klokkeslett valgfritt
--
-- Migration 020 håndhevet "STRENG MODELL": start_time NOT NULL,
-- ingen velkomst uten klokkeslett. Vi mykner det opp: ofte vet
-- man bare DATOEN for et besøk, ikke et eksakt tidspunkt.
--
-- Med start_time NULL er besøket "kun dato":
--   - velkomst-slide vises HELE dagen det er datert (samme som et
--     pinnet besøk), siden det ikke finnes et tidsvindu å gate på
--   - TV/rail viser dato i stedet for «kl. 14:00»
-- ============================================================

ALTER TABLE visits ALTER COLUMN start_time DROP NOT NULL;
