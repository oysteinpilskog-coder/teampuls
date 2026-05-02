-- ============================================================
-- Migration 022 — Ukentlig statusmail (settings)
--
-- Kolonner som styrer den planlagte ukentlige status-mailen som
-- sendes ut til teamet (typisk mandag 09:00 lokalt). Selve
-- sender-jobben (Vercel Cron + Resend/Postmark) bygges senere —
-- denne migrasjonen legger bare lagringen for innstillingene så
-- admin kan konfigurere på `/settings/email`.
--
-- Felter:
--   weekly_email_enabled          — master-bryter (default OFF, så
--                                    ingen sender ut noe før admin
--                                    har tatt et bevisst valg).
--   weekly_email_weekday          — ISO-ukedag 1..7 (1 = mandag).
--   weekly_email_hour / minute    — sendetidspunkt i org sin tidssone
--                                   (organizations.timezone). 09:00
--                                   er fornuftig default.
--   weekly_email_holiday_strategy — 'skip'         : hopp over uka helt
--                                   'next_workday' : utsett til neste
--                                                    arbeidsdag (ikke-
--                                                    helligdag, ikke
--                                                    helg) i samme uke.
--                                   'send_anyway'  : send uansett.
--   weekly_email_recipients       — 'all_members'  : alle aktive medlemmer
--                                   'admins_only'  : kun admins
--                                   'custom'       : custom-listen under
--   weekly_email_custom_recipients — TEXT[] av e-postadresser, brukes
--                                    kun når recipients = 'custom'.
--   weekly_email_subject          — overskrift-mal. NULL = bruk default
--                                    fra koden ("Ukens plan — {orgName}").
--   weekly_email_intro            — fritekst som vises øverst i mailen
--                                    (under hilsen, før status-listen).
--                                    NULL = bruk default fra koden.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS weekly_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS weekly_email_weekday SMALLINT NOT NULL DEFAULT 1
    CHECK (weekly_email_weekday BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS weekly_email_hour SMALLINT NOT NULL DEFAULT 9
    CHECK (weekly_email_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS weekly_email_minute SMALLINT NOT NULL DEFAULT 0
    CHECK (weekly_email_minute BETWEEN 0 AND 59),
  ADD COLUMN IF NOT EXISTS weekly_email_holiday_strategy TEXT NOT NULL DEFAULT 'next_workday'
    CHECK (weekly_email_holiday_strategy IN ('skip', 'next_workday', 'send_anyway')),
  ADD COLUMN IF NOT EXISTS weekly_email_recipients TEXT NOT NULL DEFAULT 'all_members'
    CHECK (weekly_email_recipients IN ('all_members', 'admins_only', 'custom')),
  ADD COLUMN IF NOT EXISTS weekly_email_custom_recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS weekly_email_subject TEXT,
  ADD COLUMN IF NOT EXISTS weekly_email_intro TEXT;
