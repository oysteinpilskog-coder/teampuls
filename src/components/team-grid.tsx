'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'
import {
  getWeekDays,
  getLastISOWeek,
  getDayLabel,
  toDateString,
  isToday,
  getTodayWeekAndYear,
} from '@/lib/dates'
import { WeekNav } from '@/components/week-nav'
import { StatusSegment, type SegmentDay } from '@/components/status-segment'
import { MemberAvatar } from '@/components/member-avatar'
import { TodayPulse } from '@/components/today-pulse'
import { CellEditor } from '@/components/cell-editor'
import { spring } from '@/lib/motion'
import { useEntries } from '@/hooks/use-entries'
import type { Entry, EntryStatus } from '@/lib/supabase/types'

interface RowSegment {
  days: SegmentDay[]
  dates: Date[]
  entry: Entry | null
}

function entriesMergeable(a: Entry | null, b: Entry | null): boolean {
  // Never merge empty days — each empty slot stays clickable on its own.
  if (a === null || b === null) return false
  return (
    a.status === b.status &&
    (a.location_label ?? null) === (b.location_label ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  )
}

function buildRowSegments(
  weekDays: Date[],
  memberId: string,
  entryMap: Map<string, Entry>
): RowSegment[] {
  const segments: RowSegment[] = []
  let i = 0
  while (i < weekDays.length) {
    const startEntry = entryMap.get(`${memberId}_${toDateString(weekDays[i])}`) ?? null
    let j = i + 1
    while (j < weekDays.length) {
      const nextEntry = entryMap.get(`${memberId}_${toDateString(weekDays[j])}`) ?? null
      if (!entriesMergeable(startEntry, nextEntry)) break
      j++
    }
    const dates = weekDays.slice(i, j)
    segments.push({
      dates,
      entry: startEntry,
      days: dates.map((date) => ({
        date: toDateString(date),
        dateLabel: formatDateLabel(date),
        isToday: isToday(date),
      })),
    })
    i = j
  }
  return segments
}

const WEEKDAY_FULL: Record<number, string> = {
  0: 'Søndag', 1: 'Mandag', 2: 'Tirsdag', 3: 'Onsdag',
  4: 'Torsdag', 5: 'Fredag', 6: 'Lørdag',
}
const MONTH_FULL: Record<number, string> = {
  0: 'januar', 1: 'februar', 2: 'mars', 3: 'april', 4: 'mai', 5: 'juni',
  6: 'juli', 7: 'august', 8: 'september', 9: 'oktober', 10: 'november', 11: 'desember',
}
function formatDateLabel(date: Date): string {
  return `${WEEKDAY_FULL[date.getDay()]} ${date.getDate()}. ${MONTH_FULL[date.getMonth()]}`
}

interface SelectedCell {
  memberId: string
  memberName: string
  date: string
  dateLabel: string
  status: EntryStatus | null
  location: string | null
  note: string | null
}

interface TeamGridProps {
  orgId: string
}

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: '88px repeat(5, 1fr)' }}>
      <div className="flex flex-col items-center gap-1.5 py-1">
        <div className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] animate-pulse" />
        <div className="h-2.5 w-12 rounded bg-[var(--bg-subtle)] animate-pulse" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-[84px] rounded-2xl bg-[var(--bg-subtle)] animate-pulse" />
      ))}
    </div>
  )
}

export function TeamGrid({ orgId }: TeamGridProps) {
  const { week: todayWeek, year: todayYear } = getTodayWeekAndYear()
  const [week, setWeek] = useState(todayWeek)
  const [year, setYear] = useState(todayYear)
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next')

  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  const weekDays = useMemo(() => getWeekDays(week, year), [week, year])
  const dateStrings = useMemo(() => weekDays.map(toDateString), [weekDays])
  const isCurrentWeek = week === todayWeek && year === todayYear

  // Realtime entries hook — handles fetch + live subscription
  const { entries, loading: entriesLoading } = useEntries(orgId, dateStrings)
  const loading = membersLoading || entriesLoading

  // Build entry lookup: member_id + date → Entry
  const entryMap = useMemo(() => {
    const map = new Map<string, typeof entries[number]>()
    entries.forEach((e) => map.set(`${e.member_id}_${e.date}`, e))
    return map
  }, [entries])

  // Only show members that have at least one entry in the visible week.
  const visibleMembers = useMemo(() => {
    const memberIdsWithEntries = new Set(entries.map((e) => e.member_id))
    return members.filter((m) => memberIdsWithEntries.has(m.id))
  }, [members, entries])

  // Fetch members once (they rarely change)
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('display_name')
    setMembers(data ?? [])
    setMembersLoading(false)
  }, [orgId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') goToPrev()
      if (e.key === 'ArrowRight') goToNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [week, year]) // eslint-disable-line react-hooks/exhaustive-deps

  function goToPrev() {
    setSlideDir('prev')
    if (week === 1) {
      const prevYear = year - 1
      setWeek(getLastISOWeek(prevYear))
      setYear(prevYear)
    } else {
      setWeek(week - 1)
    }
  }

  function goToNext() {
    setSlideDir('next')
    const lastWeek = getLastISOWeek(year)
    if (week === lastWeek) {
      setWeek(1)
      setYear(year + 1)
    } else {
      setWeek(week + 1)
    }
  }

  function goToToday() {
    setSlideDir(
      year < todayYear || (year === todayYear && week < todayWeek) ? 'next' : 'prev'
    )
    setWeek(todayWeek)
    setYear(todayYear)
  }

  function jumpTo({ week: nextWeek, year: nextYear }: { week: number; year: number }) {
    const isForward =
      nextYear > year || (nextYear === year && nextWeek > week)
    setSlideDir(isForward ? 'next' : 'prev')
    setWeek(nextWeek)
    setYear(nextYear)
  }

  // Today's entries for the Pulse widget
  const todayStr = toDateString(new Date())
  const todayEntries = members
    .map((m) => {
      const entry = entryMap.get(`${m.id}_${todayStr}`)
      if (!entry) return null
      return {
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        status: entry.status,
        location_label: entry.location_label,
      }
    })
    .filter(Boolean) as Array<{
      id: string
      display_name: string
      avatar_url: string | null
      status: import('@/lib/supabase/types').EntryStatus
      location_label: string | null
    }>

  return (
    <div className="space-y-10">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <WeekNav
          week={week}
          year={year}
          isCurrentWeek={isCurrentWeek}
          onPrev={goToPrev}
          onNext={goToNext}
          onToday={goToToday}
          onJumpTo={jumpTo}
        />
      </div>

      {/* Matrix */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
          backdropFilter: 'blur(22px) saturate(180%)',
          WebkitBackdropFilter: 'blur(22px) saturate(180%)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          boxShadow: '0 24px 64px -24px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      >
        {/* Today column highlight — vertical band spanning full matrix */}
        {(() => {
          const todayIdx = weekDays.findIndex(isToday)
          if (todayIdx === -1) return null
          // Grid: px-4 padding (16) + 88px name col + 8px gap + 5 * 1fr with 8px gaps + px-4 padding.
          // Available per day: (100% - 16*2 - 88 - 8*5) / 5 = (100% - 160px) / 5
          // Left offset to col i: 16 + 88 + 8 + i * ((100% - 160px)/5 + 8px)
          const left = `calc(112px + ${todayIdx} * ((100% - 160px) / 5 + 8px))`
          const width = `calc((100% - 160px) / 5)`
          return (
            <>
              {/* Soft vertical gradient band */}
              <div
                aria-hidden
                className="absolute pointer-events-none z-0"
                style={{
                  top: 0,
                  bottom: 0,
                  left,
                  width,
                  background: 'linear-gradient(180deg, color-mix(in oklab, var(--accent-color) 22%, transparent) 0%, color-mix(in oklab, var(--accent-color) 8%, transparent) 50%, transparent 100%)',
                  borderLeft: '1px solid color-mix(in oklab, var(--accent-color) 18%, transparent)',
                  borderRight: '1px solid color-mix(in oklab, var(--accent-color) 18%, transparent)',
                }}
              />
              {/* Top cap glow */}
              <div
                aria-hidden
                className="absolute pointer-events-none z-0"
                style={{
                  top: 0,
                  left,
                  width,
                  height: 3,
                  background: 'linear-gradient(90deg, transparent, var(--accent-color), transparent)',
                  filter: 'blur(1px)',
                  opacity: 0.8,
                }}
              />
            </>
          )
        })()}

        {/* Day header */}
        <div
          className="relative grid gap-2 px-4 py-4 z-10"
          style={{
            gridTemplateColumns: '88px repeat(5, 1fr)',
            borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          }}
        >
          <div /> {/* empty for name column */}
          {weekDays.map((date) => {
            const { weekday, day, month } = getDayLabel(date)
            const today = isToday(date)
            return (
              <div
                key={date.toISOString()}
                className="text-center relative"
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{
                    color: today ? 'var(--accent-color)' : 'var(--text-tertiary)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {weekday}
                </div>
                <div
                  className="tabular-nums leading-none mt-1"
                  style={{
                    fontFamily: 'var(--font-sora)',
                    fontSize: today ? '26px' : '22px',
                    fontWeight: today ? 700 : 600,
                    letterSpacing: '-0.03em',
                    color: today ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: today
                      ? 'linear-gradient(135deg, var(--accent-color), hsl(260, 80%, 58%))'
                      : undefined,
                    WebkitBackgroundClip: today ? 'text' : undefined,
                    WebkitTextFillColor: today ? 'transparent' : undefined,
                    backgroundClip: today ? 'text' : undefined,
                  }}
                >
                  {day}
                </div>
                <div
                  className="text-[11px] font-medium mt-0.5"
                  style={{
                    color: today ? 'color-mix(in oklab, var(--accent-color) 80%, var(--text-tertiary))' : 'var(--text-tertiary)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {month}
                </div>
              </div>
            )
          })}
        </div>

        {/* Rows */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${week}-${year}`}
            initial={{ x: slideDir === 'next' ? 32 : -32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: slideDir === 'next' ? -32 : 32, opacity: 0 }}
            transition={spring.snappy}
            className="relative p-4 space-y-2 z-10"
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : visibleMembers.map((member, rowIdx) => (
                  <motion.div
                    key={member.id}
                    className="grid gap-2 items-center"
                    style={{ gridTemplateColumns: '88px repeat(5, 1fr)' }}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ ...spring.gentle, delay: rowIdx * 0.04 }}
                  >
                    {/* Avatar + name */}
                    <div className="flex flex-col items-center gap-1.5 py-1 px-1">
                      <MemberAvatar
                        name={member.display_name}
                        avatarUrl={member.avatar_url}
                        size="md"
                      />
                      <span
                        className="text-[11px] font-semibold truncate w-full text-center leading-tight"
                        style={{ color: 'var(--text-secondary)', letterSpacing: '-0.005em' }}
                      >
                        {member.display_name.split(' ')[0]}
                      </span>
                    </div>

                    {/* Day cells — merged into segments when consecutive days share status + location + note */}
                    {buildRowSegments(weekDays, member.id, entryMap).map((seg, segIdx) => (
                      <StatusSegment
                        key={`${member.id}-${segIdx}-${seg.days[0].date}`}
                        status={seg.entry?.status ?? null}
                        location={seg.entry?.location_label ?? null}
                        note={seg.entry?.note ?? null}
                        days={seg.days}
                        onSelectDay={(dayIdx) => {
                          const date = seg.dates[dayIdx]
                          const dateStr = seg.days[dayIdx].date
                          const dayEntry = entryMap.get(`${member.id}_${dateStr}`)
                          setSelectedCell({
                            memberId: member.id,
                            memberName: member.display_name,
                            date: dateStr,
                            dateLabel: formatDateLabel(date),
                            status: dayEntry?.status ?? null,
                            location: dayEntry?.location_label ?? null,
                            note: dayEntry?.note ?? null,
                          })
                        }}
                      />
                    ))}
                  </motion.div>
                ))}

            {!loading && members.length === 0 && (
              <div className="py-16 text-center text-[var(--text-tertiary)] text-[15px]">
                Ingen teammedlemmer ennå.{' '}
                <span className="text-[var(--accent-color)]">Legg til i Innstillinger →</span>
              </div>
            )}

            {!loading && members.length > 0 && visibleMembers.length === 0 && (
              <div className="py-16 text-center text-[var(--text-tertiary)] text-[15px]">
                Ingen oppføringer denne uken.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Today Pulse widget — only shown when viewing current week */}
      {isCurrentWeek && todayEntries.length > 0 && (
        <TodayPulse entries={todayEntries} />
      )}

      {/* Cell editor — single instance shared across all cells */}
      <CellEditor
        open={selectedCell !== null}
        onClose={() => setSelectedCell(null)}
        orgId={orgId}
        memberId={selectedCell?.memberId ?? ''}
        memberName={selectedCell?.memberName ?? ''}
        date={selectedCell?.date ?? ''}
        dateLabel={selectedCell?.dateLabel ?? ''}
        initialStatus={selectedCell?.status ?? null}
        initialLocation={selectedCell?.location ?? null}
        initialNote={selectedCell?.note ?? null}
      />
    </div>
  )
}
