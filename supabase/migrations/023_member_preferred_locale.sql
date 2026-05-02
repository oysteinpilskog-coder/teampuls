-- ============================================================
-- Migration 023 — Member.preferred_locale
--
-- Per-medlem språkpreferanse for utgående e-post (og andre
-- mottaker-spesifikke renderinger som SMS/push når det kommer).
-- UI-en på `/settings/members` vil tilby en dropdown; verdier
-- matcher `Locale`-unionen i `src/lib/i18n/types.ts`.
--
-- NULL = ikke valgt eksplisitt. Senderen utleder da fra medlemmets
-- kontor sin `country_code` (NO→no, SE→sv, GB→en, LT→lt) og
-- faller til slutt tilbake til org sin DEFAULT_LOCALE ('no').
-- Det gjør at eksisterende rader får riktig språk uten manuell
-- oppdatering: en svensk konto i Stockholm får svensk mail med en
-- gang country_code er satt på kontoret.
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT
    CHECK (preferred_locale IS NULL OR preferred_locale IN ('no', 'en', 'sv', 'es', 'lt'));
