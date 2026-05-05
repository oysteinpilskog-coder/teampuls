-- ============================================================
-- Per-org brand pair (SaaS-grade theming).
--
-- `brand_primary` and `brand_accent` together drive the dominant
-- Blue Violet / Light Blue pair across the entire UI — replacing the
-- hardcoded values in src/app/globals.css for everything that's
-- semantically "primary" (ink, foreground, dark-mode canvas) or
-- "accent" (ember, ring, focus, gradient highlights).
--
-- Distinct from:
--   - `accent_color`   : workspace tint (header pill, switcher glow).
--                        Kept; orthogonal to brand identity.
--   - `primary_color`  : legacy field, kept for migration safety.
--
-- Defaults match the canonical CalWin BrandBook §3 pair, so existing
-- orgs (including CalWin's own row) render visually unchanged.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_primary text NOT NULL DEFAULT '#322E7A',
  ADD COLUMN IF NOT EXISTS brand_accent  text NOT NULL DEFAULT '#66C4EF';

-- Hex validation (#RRGGBB only — keeps the layout's inline-style
-- injection trivially safe; no rgb()/hsl()/named colors that could
-- expose a CSS-injection seam).
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_brand_primary_hex;
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_brand_accent_hex;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_brand_primary_hex
    CHECK (brand_primary ~* '^#[0-9a-f]{6}$');
ALTER TABLE organizations
  ADD CONSTRAINT organizations_brand_accent_hex
    CHECK (brand_accent ~* '^#[0-9a-f]{6}$');

COMMENT ON COLUMN organizations.brand_primary IS
  'Dominant brand color (Blue Violet slot). Drives --ink, --primary, --foreground, dark-mode canvas. Hex format (#RRGGBB).';
COMMENT ON COLUMN organizations.brand_accent IS
  'Brand accent (Light Blue slot). Drives --ember, --ring, --accent-color, gradient highlights. Hex format (#RRGGBB).';
