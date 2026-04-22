// Manual types based on supabase/migrations/001_initial.sql
// Run `npx supabase gen types typescript --project-id $PROJECT_ID > src/lib/supabase/types.ts`
// to regenerate from the live schema.

export type EntryStatus = 'office' | 'remote' | 'customer' | 'travel' | 'vacation' | 'sick' | 'off'
export type MemberRole = 'admin' | 'member'
export type EntrySource = 'manual' | 'ai_web' | 'ai_email'
export type EventCategory = 'company' | 'trade_show' | 'training' | 'milestone' | 'holiday' | 'deadline' | 'other'

export interface Organization {
  id: string
  name: string
  slug: string
  inbound_email: string
  logo_url: string | null
  primary_color: string
  /** Per-org override of the 7 status colors. NULL/undefined = use DEFAULT_HEX_COLORS. */
  status_colors?: Partial<Record<EntryStatus, string>> | null
  timezone: string
  week_start: number
  created_at: string
  updated_at: string
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
