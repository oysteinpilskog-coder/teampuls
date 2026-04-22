// Manual types based on supabase/migrations/001_initial.sql
// Run `npx supabase gen types typescript --project-id $PROJECT_ID > src/lib/supabase/types.ts`
// to regenerate from the live schema.

export type EntryStatus = 'office' | 'remote' | 'customer' | 'travel' | 'vacation' | 'sick' | 'off'
export type MemberRole = 'admin' | 'member'
export type EntrySource = 'manual' | 'ai_web' | 'ai_email'
export type EventCategory = 'company' | 'trade_show' | 'training' | 'milestone' | 'holiday' | 'deadline' | 'other'
export type WorkspaceRegion = 'eu' | 'uk' | 'us' | 'apac'
/**
 * How the UI should render days with no registered entry.
 * - 'none'       : leave the cell empty — no assumption (default)
 * - 'office'     : assume "office" for all members with no entry
 * - 'remote'     : assume "remote" for all members with no entry
 * - 'per_member' : use each member's own default_status
 */
export type PresenceAssumption = 'none' | 'office' | 'remote' | 'per_member'

export interface Account {
  id: string
  name: string
  slug: string
  billing_email: string | null
  plan: 'free' | 'pro' | 'enterprise' | string
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  account_id: string | null
  name: string
  slug: string
  inbound_email: string
  logo_url: string | null
  primary_color: string
  /** Per-workspace brand accent (hex) — drives the header pill + glow. */
  accent_color: string | null
  /** Short 2–4 letter badge shown in the switcher pill, e.g. "UK", "NO". */
  short_name: string | null
  /** ISO 3166-1 alpha-2, drives a flag hint in the switcher. */
  country_code: string | null
  region: WorkspaceRegion
  archived_at: string | null
  /** Per-org override of the 7 status colors. NULL/undefined = use DEFAULT_HEX_COLORS. */
  status_colors?: Partial<Record<EntryStatus, string>> | null
  /** How the UI should render unregistered days — see PresenceAssumption. */
  default_presence_assumption?: PresenceAssumption
  timezone: string
  week_start: number
  created_at: string
  updated_at: string
}

/**
 * Slim workspace shape used by the switcher. Derived from
 * `current_user_workspaces()` RPC — one row per membership the
 * logged-in user has.
 */
export interface WorkspaceSummary {
  org_id: string
  account_id: string | null
  name: string
  slug: string
  short_name: string | null
  region: WorkspaceRegion
  country_code: string | null
  accent_color: string | null
  logo_url: string | null
  role: MemberRole
}

export interface Office {
  id: string
  org_id: string
  name: string
  address: string | null
  city: string | null
  postal_code: string | null
  country_code: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
  sort_order: number
  created_at: string
}

export interface Customer {
  id: string
  org_id: string
  name: string
  address: string | null
  city: string | null
  postal_code: string | null
  country_code: string | null
  latitude: number | null
  longitude: number | null
  aliases: string[]
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Member {
  id: string
  org_id: string
  user_id: string | null
  display_name: string
  full_name: string | null
  initials: string | null
  email: string
  avatar_url: string | null
  nicknames: string[]
  home_office_id: string | null
  /** Member-level fallback used when org default_presence_assumption === 'per_member'.
   *  Optional because legacy code paths select only a subset of columns. */
  default_status?: EntryStatus | null
  role: MemberRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  org_id: string
  member_id: string
  date: string             // 'YYYY-MM-DD'
  status: EntryStatus
  location_label: string | null
  note: string | null
  source: EntrySource
  source_text: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OrgEvent {
  id: string
  org_id: string
  title: string
  description: string | null
  category: EventCategory
  start_date: string
  end_date: string
  color: string | null
  attendee_ids: string[]
  is_recurring: boolean
  recurrence_years: number[]
  created_by: string | null
  created_at: string
  updated_at: string
}
