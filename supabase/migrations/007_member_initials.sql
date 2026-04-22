-- ============================================================
-- Add `initials` (short 2-3 letter handle) and `full_name`
-- to members.
--
-- `initials` is used by the AI parser to resolve short references
-- like "ØP" → "Øystein Pilskog" in prompts such as
--   "fikser ØP fjerdingstad uke 18"
-- and is shown on the team overview so two people with the same
-- first letter (e.g. Johan / Javier) are distinguishable.
--
-- `full_name` is an optional longer name used when `display_name`
-- is just a first name or informal handle.
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS initials TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Backfill full_name from display_name for existing rows
UPDATE members
SET full_name = display_name
WHERE full_name IS NULL;

-- Backfill initials:
-- 1) Prefer an existing 2-char nickname (e.g. 'ØF', 'JL' already in seed)
-- 2) Otherwise derive from the first two words of display_name
UPDATE members
SET initials = UPPER(COALESCE(
  (SELECT n FROM unnest(nicknames) n WHERE char_length(n) = 2 LIMIT 1),
  LEFT(split_part(display_name, ' ', 1), 1)
    || NULLIF(LEFT(split_part(display_name, ' ', 2), 1), '')
))
WHERE initials IS NULL;

-- Enforce uniqueness per org (case-insensitive) so "ØP" resolves
-- unambiguously. Allows NULL for orgs migrating gradually.
CREATE UNIQUE INDEX IF NOT EXISTS members_initials_unique
  ON members (org_id, UPPER(initials))
  WHERE initials IS NOT NULL;
