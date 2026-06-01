-- ============================================================
-- Org-wide default theme variant + dashboard mode.
--
-- Branding should look the same for everyone by default: when an
-- admin picks a theme variant or dashboard mode it becomes the
-- org-wide default that every user sees. Individual users may still
-- override locally (theme: localStorage, dashboard: cookie) — the
-- override always wins, the org default is only the fallback.
--
--   `default_theme_variant`  : one of the nine premium variants in
--                              src/lib/themes.ts. Drives the initial
--                              data-theme before any user override.
--   `default_dashboard_mode` : 'standard' | 'brand' — which variant
--                              /dashboard resolves to by default.
--
-- Defaults match the current hardcoded fallbacks ('nordic' /
-- 'standard') so existing orgs render visually unchanged.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_theme_variant  text NOT NULL DEFAULT 'nordic',
  ADD COLUMN IF NOT EXISTS default_dashboard_mode text NOT NULL DEFAULT 'standard';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_default_theme_variant_chk;
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_default_dashboard_mode_chk;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_default_theme_variant_chk
    CHECK (default_theme_variant IN (
      'nordic', 'obsidian', 'aurora', 'crystal', 'ember',
      'sakura', 'forest', 'monaco', 'champagne'
    ));
ALTER TABLE organizations
  ADD CONSTRAINT organizations_default_dashboard_mode_chk
    CHECK (default_dashboard_mode IN ('standard', 'brand'));

COMMENT ON COLUMN organizations.default_theme_variant IS
  'Org-wide default theme variant (one of the nine in src/lib/themes.ts). Fallback when a user has no local override.';
COMMENT ON COLUMN organizations.default_dashboard_mode IS
  'Org-wide default for which variant /dashboard resolves to (standard|brand). Fallback when a user has no cookie override.';
