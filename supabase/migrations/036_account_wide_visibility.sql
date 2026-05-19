-- ============================================================
-- Migration 036 — Account-wide read visibility
--
-- Før: en bruker så kun de workspaces de hadde et eksplisitt
-- `members`-record i. For å la admin Øystein bytte mellom CalWin
-- Nordic og CalWin UK måtte migrasjon 010 opprette et duplikat-
-- medlemskap i UK. Vanlige brukere (Johan, Maria, James, Sophie)
-- var låst til sin egen side og kunne aldri se hva motparten gjorde.
--
-- Etter: enhver bruker med medlemskap i ett workspace under en
-- account får automatisk *lese*-tilgang til alle andre workspaces
-- under samme account. Switcheren viser dem alle, grid/dashboard/
-- årshjul rendrer dataene deres, og Supabase Realtime broadcaster
-- oppdateringer på tvers av hele accountet.
--
-- Skriving forblir streng — `current_user_is_admin(org_id)` endres
-- IKKE, så admin-operasjoner krever fortsatt et faktisk
-- medlemskap med admin-rollen i akkurat det workspacet. Entries-
-- write-policies (fra migrasjon 035) gater på `member_id IN (my
-- memberships)` eller admin, så viewere kan ikke registrere fravær
-- på tvers heller. AI/parse + AI/query 403'er via session-laget
-- når caller er viewer.
--
-- `visits`-tabellen brukte `current_user_org_ids()` for write
-- (migrasjon 020/035) — den helperen utvides nå til hele
-- accountet, så vi re-anchorer `visits_*` til en ny helper
-- `current_user_has_membership(org_id)` for å bevare opprinnelig
-- intensjon: viewere kan lese besøk men ikke registrere dem.
-- ============================================================

-- ------------------------------------------------------------
-- 1. current_user_org_ids() — account-wide
--
-- Returnerer unionen av alle ikke-arkiverte org-id-er under
-- enhver account hvor caller har minst ett aktivt medlemskap.
-- Dette driver alle eksisterende SELECT-policies på tvers av
-- skjemaet (accounts, customers, visits, entries_read, …) så
-- å åpne den opp cascader naturlig uten å røre noen policy-
-- definisjoner.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM organizations o
  WHERE o.archived_at IS NULL
    AND o.account_id IN (
      SELECT DISTINCT o2.account_id
      FROM members m
      JOIN organizations o2 ON o2.id = m.org_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND o2.account_id IS NOT NULL
    );
$$;

-- ------------------------------------------------------------
-- 2. current_user_has_membership(org_id) — streng medlemsskap-sjekk
--
-- Returnerer true kun når caller har et aktivt medlemskap i det
-- gitte workspacet. Brukes av write-policies som må avvise
-- viewer-mode (account-wide lese, men ingen ekte sete).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_has_membership(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM members m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.org_id  = p_org_id
      AND m.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_membership(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3. current_user_workspaces() — account-wide, med viewer-rolle
--
-- Returnerer én rad per workspace under caller sitt account(er).
-- `role` er caller sin faktiske rolle i det workspacet, eller
-- den syntetiske strengen 'viewer' for workspaces caller kan
-- lese men ikke har medlemskap i. Session-laget
-- (src/lib/supabase/session.ts) bruker 'viewer' til å gate
-- skrive-flater (AI input, InactivityNudge, settings-sider).
--
-- Inkluderer brand_primary/brand_accent fra migrasjon 030 så
-- WorkspaceSummary kan rendres med riktig brand-pair også for
-- viewer-rader.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_workspaces()
RETURNS TABLE (
  org_id        uuid,
  account_id    uuid,
  name          text,
  slug          text,
  short_name    text,
  region        text,
  country_code  text,
  accent_color  text,
  logo_url      text,
  role          text,
  brand_primary text,
  brand_accent  text
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_accounts AS (
    SELECT DISTINCT o.account_id
    FROM members m
    JOIN organizations o ON o.id = m.org_id
    WHERE m.user_id = (SELECT auth.uid())
      AND m.is_active = true
      AND o.account_id IS NOT NULL
  )
  SELECT
    o.id,
    o.account_id,
    o.name,
    o.slug,
    o.short_name,
    o.region,
    o.country_code,
    o.accent_color,
    o.logo_url,
    COALESCE(m.role::text, 'viewer') AS role,
    o.brand_primary,
    o.brand_accent
  FROM organizations o
  LEFT JOIN members m
    ON m.org_id = o.id
   AND m.user_id = (SELECT auth.uid())
   AND m.is_active = true
  WHERE o.account_id IN (SELECT account_id FROM my_accounts)
    AND o.archived_at IS NULL
  ORDER BY o.name;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_workspaces() TO authenticated;

-- ------------------------------------------------------------
-- 4. Re-anchor visits write-policies til faktisk medlemskap
--
-- Migrasjon 035 splittet visits FOR ALL i per-action policies
-- (insert/update/delete) — alle gate'r på `current_user_org_ids()`.
-- Med (1) over er det nå hele accountet, og vi vil ikke at en
-- Nordic-viewer skal kunne registrere gjester for UK-resepsjonen.
-- Bytt til den strenge helper-en. Lese-policyen forblir bred
-- (alle i accountet kan se besøk).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS visits_insert ON visits;
CREATE POLICY visits_insert ON visits FOR INSERT
  WITH CHECK (current_user_has_membership(org_id));

DROP POLICY IF EXISTS visits_update ON visits;
CREATE POLICY visits_update ON visits FOR UPDATE
  USING (current_user_has_membership(org_id))
  WITH CHECK (current_user_has_membership(org_id));

DROP POLICY IF EXISTS visits_delete ON visits;
CREATE POLICY visits_delete ON visits FOR DELETE
  USING (current_user_has_membership(org_id));
