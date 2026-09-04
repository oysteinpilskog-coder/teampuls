'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarRange } from 'lucide-react'
import { SommerMonthMatrix } from '@/components/sommer-month-matrix'
import { SommerWeekMatrix, type WeekScope } from '@/components/sommer-week-matrix'
import { useT } from '@/lib/i18n/context'
import type { Entry, Member, MemberRole, WorkspaceSummary } from '@/lib/supabase/types'

type Mode = 'day' | 'week'
const STORAGE_KEY = 'teampulse:sommer-view'
const SCOPE_KEY = 'teampulse:sommer-week-scope'

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
 *
 * The year lives here, not inside the matrices: the page defaults to the
 * *next* summer once we're past August, and the week view's month band only
 * says "Juni Juli August" — without a visible year picker nobody can tell
 * which summer they're looking at. Both views read the same year, so
 * flipping the toggle never silently changes the period.
 *
 * The week view's scope lives here too. It defaults to the whole year: not
 * everyone takes their vacation in summer, and a planner that silently hides
 * February reads as one that has lost the entry. "Sommer" narrows it back to
 * May–September when you're doing actual summer planning.
 */
export function SommerView(props: Props) {
  const t = useT()
  const { monthEntries, yearEntries, initialYear, ...shared } = props

  const [mode, setMode] = useState<Mode>('day')
  const [scope, setScope] = useState<WeekScope>('year')
  const [year, setYear] = useState(initialYear)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'week' || saved === 'day') setMode(saved)
    const savedScope = window.localStorage.getItem(SCOPE_KEY)
    if (savedScope === 'season' || savedScope === 'year') setScope(savedScope)
    setHydrated(true)
  }, [])

  function pick(next: Mode) {
    setMode(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* noop */ }
  }

  function pickScope(next: WeekScope) {
    setScope(next)
    try { window.localStorage.setItem(SCOPE_KEY, next) } catch { /* noop */ }
  }

  // Last year, this year, next year — plus whatever the page defaulted to
  // and whatever the month chevrons have wandered into, so the active year
  // always has a pill to sit on.
  const years = useMemo(() => {
    const thisYear = new Date().getFullYear()
    const set = new Set([thisYear - 1, thisYear, thisYear + 1, initialYear, year])
    return [...set].sort((a, b) => a - b)
  }, [initialYear, year])

  // The SSR payload only covers `initialYear`. Seeding a different year with
  // it would paint the wrong summer, so hand the matrix nothing and let it
  // fetch instead.
  const seeded = year === initialYear

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
        <div
          role="tablist"
          aria-label={t.summer.yearSwitcherAria}
          className="inline-flex items-center gap-1 p-1 rounded-2xl"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          }}
        >
          {years.map((y) => (
            <ToggleButton
              key={y}
              active={y === year}
              onClick={() => setYear(y)}
              label={String(y)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hydrated && mode === 'week' ? (
            <div
              role="tablist"
              aria-label={t.summer.scopeToggleAria}
              className="inline-flex items-center gap-1 p-1 rounded-2xl"
              style={{
                background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
                border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              }}
            >
              <ToggleButton
                active={scope === 'season'}
                onClick={() => pickScope('season')}
                label={t.summer.scopeSeason}
              />
              <ToggleButton
                active={scope === 'year'}
                onClick={() => pickScope('year')}
                label={t.summer.scopeYear}
              />
            </div>
          ) : null}

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
      </div>

      {hydrated && mode === 'week' ? (
        <SommerWeekMatrix
          {...shared}
          initialEntries={seeded ? yearEntries : undefined}
          year={year}
          scope={scope}
        />
      ) : (
        <SommerMonthMatrix
          {...shared}
          initialEntries={seeded ? monthEntries : undefined}
          year={year}
          onYearChange={setYear}
        />
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
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12.5px] font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-accent)]"
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
