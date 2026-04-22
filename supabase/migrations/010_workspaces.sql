-- ============================================================
-- Migration 010 — Multi-workspace SaaS foundation
--
-- Before: one `organizations` row per company, one `members` row
-- per user. "CalWin Nordic" and "CalWin UK" lived in the same org
-- with geo suffixes on emails — everything mixed on the overview.
--
-- After: two-level tenant model that scales internationally.
--
--   accounts         (billing entity, e.g. "CalWin")
--     └─ organizations  (region-scoped workspace, e.g. "CalWin UK")
--          └─ members   (per-workspace membership; a user can
--                        belong to N workspaces under one account
--                        or across accounts)
--
-- `organizations.id` is still the workspace id — every other table
-- (`entries`, `offices`, `customers`, `events`) keeps its existing
-- `org_id` FK unchanged. This migration is purely additive at the
-- table level: no columns renamed, no data destroyed.
--
-- The existing RLS helpers `current_user_org_ids()` and
-- `current_user_is_admin(org_id)` already resolve a *set* of orgs
-- for the logged-in user — so allowing multiple member rows per
-- user "just works" without touching any policy.
--
-- CalWin demo data is split: the existing org becomes "CalWin
-- Nordic", and a new "CalWin UK" workspace is created. James and
-- Sophie (the two @calwin.co.uk members) move to the UK
-- workspace; their entries follow via `member_id → org_id` sync.
-- Admin Øystein gets a second membership in UK so he keeps his
-- cross-workspace view.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ACCOUNTS (billing / top-level tenant)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  -- Contact email used for invoices / account-level notifications.
  billing_email text,
  -- Free/pro/enterprise — kept simple for now, drives feature flags later.
  plan        text NOT NULL DEFAULT 'free',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Everyone with a membership under the account can read the
-- account row; only admins of *any* workspace under it can write.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_read ON accounts FOR SELECT
  USING (
    id IN (
      SELECT o.account_id
      FROM organizations o
      WHERE o.id = ANY(current_user_org_ids())
        AND o.account_id IS NOT NULL
    )
  );

CREATE POLICY accounts_write ON accounts FOR UPDATE
  USING (
    id IN (
      SELECT o.account_id
      FROM organizations o
      WHERE o.account_id IS NOT NULL
        AND current_user_is_admin(o.id)
    )
  );

-- ------------------------------------------------------------
-- 2. ORGANIZATIONS → workspace fields
-- ------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS account_id   uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region       text NOT NULL DEFAULT 'eu'
    CHECK (region IN ('eu','uk','us','apac')),
  ADD COLUMN IF NOT EXISTS accent_color text,           -- per-workspace brand accent (hex)
  ADD COLUMN IF NOT EXISTS short_name   text,           -- 2–4 letter badge, e.g. "UK"
  ADD COLUMN IF NOT EXISTS country_code text,           -- ISO 3166-1 alpha-2 for flag hint
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_organizations_account_id ON organizations(account_id);

-- ------------------------------------------------------------
-- 3. MEMBERS → a user can now have N memberships
--
-- Drop the (user_id) unique constraint if it was defined; keep
-- (org_id, email) unique so the same person invited twice to the
-- same workspace collapses to one row. A user has at most one
-- membership *per workspace*.
-- ------------------------------------------------------------

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'members'
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname ORDER BY a.attnum)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = ARRAY['user_id']::name[];

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE members DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Enforce one membership per (user_id, org_id). NULL user_ids
-- (invited-but-not-linked rows) are excluded from the uniqueness
-- check by the partial index.
CREATE UNIQUE INDEX IF NOT EXISTS members_user_org_unique
  ON members(user_id, org_id)
  WHERE user_id IS NOT NULL;

-- Helper: list the workspaces the logged-in user can access,
-- ordered by most recent activity (last_seen_at if present, else
-- created_at). The switcher UI reads this.
CREATE OR REPLACE FUNCTION current_user_workspaces()
RETURNS TABLE (
  org_id       uuid,
  account_id   uuid,
  name         text,
  slug         text,
  short_name   text,
  region       text,
  country_code text,
  accent_color text,
  logo_url     text,
  role         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    m.role::text
  FROM organizations o
  JOIN members m ON m.org_id = o.id
  WHERE m.user_id = auth.uid()
    AND m.is_active = true
    AND o.archived_at IS NULL
  ORDER BY o.name;
$$;

GRANT EXECUTE ON FUNCTION current_user_workspaces() TO authenticated;

-- ------------------------------------------------------------
-- 4. DEMO DATA — split CalWin into "CalWin Nordic" + "CalWin UK"
--
-- Idempotent: guarded by existence checks so re-running is safe.
-- ------------------------------------------------------------

DO $$
DECLARE
  v_account_id  uuid;
  v_nordic_org  uuid := '00000000-0000-0000-0000-000000000001';  -- existing
  v_uk_org      uuid := '00000000-0000-0000-0000-000000000002';  -- new
  m_oystein     uuid;
  m_james       uuid;
  m_sophie      uuid;
  m_oystein_uk  uuid;
BEGIN
  -- 4a. CalWin account
  INSERT INTO accounts (name, slug, billing_email, plan)
  VALUES ('CalWin', 'calwin', 'billing@calwin.no', 'pro')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM accounts WHERE slug = 'calwin';
  END IF;

  -- 4b. Rename existing org → "CalWin Nordic", link to account,
  --     tag region, give it a brand accent.
  UPDATE organizations
  SET name         = 'CalWin Nordic',
      slug         = 'calwin-nordic',
      account_id   = v_account_id,
      region       = 'eu',
      country_code = 'NO',
      short_name   = 'NO',
      accent_color = COALESCE(accent_color, '#3B82F6')  -- Nordic blue
  WHERE id = v_nordic_org;

  -- 4c. Create "CalWin UK" workspace (idempotent)
  INSERT INTO organizations (
    id, account_id, name, slug, inbound_email,
    region, country_code, short_name, accent_color,
    primary_color, timezone, week_start
  ) VALUES (
    v_uk_org, v_account_id, 'CalWin UK', 'calwin-uk', 'uk@calwin.co.uk',
    'uk', 'GB', 'UK', '#E11D48',   -- UK crimson
    '#E11D48', 'Europe/London', 1
  )
  ON CONFLICT (id) DO UPDATE SET
    account_id   = EXCLUDED.account_id,
    region       = EXCLUDED.region,
    country_code = EXCLUDED.country_code,
    short_name   = EXCLUDED.short_name;

  -- 4d. Move UK members to UK workspace. Their entries carry
  --     `org_id` independently, so we also re-point entries that
  --     belong to those members.
  SELECT id INTO m_james  FROM members WHERE email = 'james@calwin.co.uk'  AND org_id = v_nordic_org;
  SELECT id INTO m_sophie FROM members WHERE email = 'sophie@calwin.co.uk' AND org_id = v_nordic_org;

  IF m_james IS NOT NULL THEN
    UPDATE entries SET org_id = v_uk_org WHERE member_id = m_james;
    UPDATE members SET org_id = v_uk_org WHERE id = m_james;
  END IF;

  IF m_sophie IS NOT NULL THEN
    UPDATE entries SET org_id = v_uk_org WHERE member_id = m_sophie;
    UPDATE members SET org_id = v_uk_org WHERE id = m_sophie;
  END IF;

  -- 4e. Admin Øystein gets a second membership in UK so he keeps
  --     the cross-workspace view (this is the "switch" target).
  SELECT id INTO m_oystein
  FROM members
  WHERE email = 'oystein@calwin.no' AND org_id = v_nordic_org;

  IF m_oystein IS NOT NULL THEN
    INSERT INTO members (org_id, display_name, email, nicknames, role, is_active, user_id)
    SELECT v_uk_org, display_name, email, nicknames, 'admin', true, user_id
    FROM members WHERE id = m_oystein
    ON CONFLICT (org_id, email) DO NOTHING;
  END IF;
END $$;
