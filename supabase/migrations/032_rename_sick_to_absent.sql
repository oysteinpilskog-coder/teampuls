-- ============================================================
-- Migration 032 — Rename 'sick' status → 'absent', drop sykefravær-privacy.
--
-- TeamPulse henger på en TV-skjerm i resepsjonen. Å lagre eller vise
-- «syk» som egen verdi er behandling av helseopplysninger (GDPR art. 9),
-- og en privacy-toggle redder ikke det — så lenge verdien finnes i basen
-- så *behandles* den. Vi fjerner kategorien helt: TeamPulse forteller
-- KUN at noen er fraværende, aldri hvorfor. Sykedags-bokføring hører
-- hjemme i HR-systemet (Tripletex/Visma/…), ikke her.
--
-- Tre operasjoner i én migrering så DB aldri står i et halvferdig
-- mellomtrinn:
--
-- 1. Enum-verdi 'sick' → 'absent'. ALTER TYPE ... RENAME VALUE er en
--    in-place-operasjon i Postgres 10+, så alle eksisterende rader
--    følger med automatisk og indekser/constraints holder seg.
--
-- 2. members.default_status CHECK-constrainten teller opp enum-verdiene
--    eksplisitt — droppes og opprettes på nytt med 'absent' istedenfor.
--
-- 3. organizations.dashboard_show_sick fjernes. Bryteren mister sin
--    mening når kategorien forsvinner.
-- ============================================================

-- ── 1. Gi nytt navn til enum-verdien ──────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'entry_status' AND e.enumlabel = 'sick'
  ) THEN
    ALTER TYPE entry_status RENAME VALUE 'sick' TO 'absent';
  END IF;
END $$;

-- ── 2. members.default_status CHECK må mirror'e enum-listen ──
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.members'::regclass
    AND pg_get_constraintdef(oid) ILIKE '%default_status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE members DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE members
  ADD CONSTRAINT members_default_status_check
  CHECK (default_status IS NULL OR default_status IN (
    'office', 'remote', 'customer', 'event', 'travel',
    'vacation', 'absent', 'off'
  ));

-- ── 3. Fjern sykefravær-privacy-bryteren ─────────────────────
ALTER TABLE organizations
  DROP COLUMN IF EXISTS dashboard_show_sick;
