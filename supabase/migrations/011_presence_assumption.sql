-- ============================================================
-- Migration 010 — Presence-assumption defaults
--
-- Premium UX question: when a member has no entry for a date, what
-- do we render? Three honest options:
--
--   'none'       (DEFAULT)    — leave the cell empty. No assumption.
--   'office'                  — assume they're at the office.
--   'remote'                  — assume they're working from home.
--   'per_member'              — use each member's own default_status
--                               column (falls back to 'office' if null).
--
-- Assumed rendering is always visually distinct from registered data
-- (40% opacity, dashed rim) so users can still tell "logged" from
-- "inferred" at a glance — see src/lib/presence.ts (resolveStatus).
--
-- Empty-by-default keeps the data honest for new orgs; admins can
-- opt into an assumption that matches their team's reality.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_presence_assumption text
    NOT NULL DEFAULT 'none'
    CHECK (default_presence_assumption IN ('none', 'office', 'remote', 'per_member'));

-- Per-member default. Only consulted when org default is 'per_member'.
-- Values mirror entries.status check constraint (see migration 001).
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS default_status text
    CHECK (default_status IS NULL OR default_status IN (
      'office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off'
    ));
