import type { Entry, EntryStatus, Member, PresenceAssumption } from '@/lib/supabase/types'

export interface ResolvedStatus {
  /** The status to render, or null if the cell should stay empty. */
  status: EntryStatus | null
  /** Free-text location (from entry). Never set for assumed statuses. */
  location: string | null
  /** Free-text note (from entry). Never set for assumed statuses. */
  note: string | null
  /** true when the status came from a real entry, false when it was inferred. */
  isAssumed: boolean
}

/**
 * Resolve which status a cell should display for a given (member, date) pair.
 * Returns null-status when no entry exists and the org opted out of assumptions.
 *
 * `isAssumed` lets the UI render a visual distinction (lower opacity, dashed rim)
 * so users can tell registered data from inference at a glance.
 */
export function resolveStatus(
  entry: Entry | null | undefined,
  member: Pick<Member, 'default_status'> | null | undefined,
  assumption: PresenceAssumption
): ResolvedStatus {
  if (entry) {
    return {
      status: entry.status,
      location: entry.location_label,
      note: entry.note,
      isAssumed: false,
    }
  }

  const assumed = inferStatus(member, assumption)
  return {
    status: assumed,
    location: null,
    note: null,
    isAssumed: assumed !== null,
  }
}

/**
 * Standalone version of the assumption resolver — returns just the inferred
 * status (or null) for code paths that don't need the full ResolvedStatus.
 */
export function inferStatus(
  member: Pick<Member, 'default_status'> | null | undefined,
  assumption: PresenceAssumption,
): EntryStatus | null {
  switch (assumption) {
    case 'none':
      return null
    case 'office':
      return 'office'
    case 'remote':
      return 'remote'
    case 'per_member':
      // Fall back to 'office' if the member hasn't set a personal default — the
      // org opted into per-member behavior, so zero-assumption doesn't match
      // their intent.
      return member?.default_status ?? 'office'
  }
}
