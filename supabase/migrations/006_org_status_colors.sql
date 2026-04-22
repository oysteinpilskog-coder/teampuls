-- ============================================================
-- Custom status colors per organization.
-- NULL = use application defaults (DEFAULT_HEX_COLORS in code).
-- Shape: { office, remote, customer, travel, vacation, sick, off } → hex strings.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status_colors JSONB;
