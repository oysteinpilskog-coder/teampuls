'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, CalendarRange } from 'lucide-react'
import { SommerMonthMatrix } from '@/components/sommer-month-matrix'
import { SommerWeekMatrix } from '@/components/sommer-week-matrix'
import { useT } from '@/lib/i18n/context'
import type { Entry, Member, MemberRole, WorkspaceSummary } from '@/lib/supabase/types'

type Mode = 'day' | 'week'
const STORAGE_KEY = 'teampulse:sommer-view'

interface Props {
  orgIds: string[]
  currentMemberId: string
  currentMemberRole: MemberRole
  initialMembers: Member[]
  /** Vacation entries scoped to the active month — seeds the day view. */
  monthEntries: Entry[]
  /** Vacation entries for the whole target year — seeds the week view so it
   *  can auto-fit its columns to the weeks that actually contain data. */
  yearEntries: Entry[]
  initialMonth: number
  initialYear: number
  workspaces?: WorkspaceSummary[]
  combinedView?: boolean
  ukOfficeIds?: string[]
}

/**
 * /sommer shell. Switches between the day view (month-by-month, per-weekday
 * precision) and the week view (whole-summer overview, one column per ISO
 * week). The chosen mode persists per browser so a TV or a planner keeps
 * the view it was left on.
 */
export function SommerView(props: Props) {
  const t = useT()
  const { monthEntries, yearEntries, ...shared } = props

  const [mode, setMode] = useState<Mode>('day')
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'week' || saved === 'day') setMode(saved)
    setHydrated(true)
  }, [])

  function pick(next: Mode) {
    setMode(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* noop */ }
  }

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex justify-center sm:justify-end px-1">
        <div
          role="tablist"
          aria-label={t.summer.viewToggleAria}
          className="inline-flex items-center gap-1 p-1 rounded-2xl"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          }}
        >
          <ToggleButton
            active={mode === 'day'}
            onClick={() => pick('day')}
            label={t.summer.viewDay}
            icon={<CalendarDays className="w-3.5 h-3.5" strokeWidth={1.75} />}
          />
          <ToggleButton
            active={mode === 'week'}
            onClick={() => pick('week')}
            label={t.summer.viewWeek}
            icon={<CalendarRange className="w-3.5 h-3.5" strokeWidth={1.75} />}
          />
        </div>
      </div>

      {hydrated && mode === 'week' ? (
        <SommerWeekMatrix {...shared} initialEntries={yearEntries} year={props.initialYear} />
      ) : (
        <SommerMonthMatrix {...shared} initialEntries={monthEntries} />
      )}
    </div>
  )
}

function ToggleButton({
  active, onClick, label, icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-accent)]"
      style={{
        color: active ? 'var(--lg-accent)' : 'var(--text-secondary)',
        background: active
          ? 'color-mix(in oklab, var(--lg-accent) 12%, transparent)'
          : 'transparent',
        border: active
          ? '1px solid color-mix(in oklab, var(--lg-accent) 30%, transparent)'
          : '1px solid transparent',
        fontFamily: 'var(--font-body)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
