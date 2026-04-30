'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Visit } from '@/lib/supabase/types'
import { toDateString } from '@/lib/dates'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'

// Velkomst-vinduet på TV-en: 60 minutter før start_time → 15 minutter etter
// (end_time hvis satt, ellers start_time). For lange besøk («kl 11–16»)
// betyr det at velkomsten holdes oppe gjennom hele besøket — ikke bare de
// første 15 minuttene — siden gjester kan komme inn dropvis. Uten end_time
// faller vi tilbake til den gamle 15-minutters bufferen etter start.
export const WELCOME_PRE_WINDOW_MIN = 60
export const WELCOME_POST_WINDOW_MIN = 15

/** Parse en postgres TIME-string ('HH:MM:SS' eller 'HH:MM') til minutter siden midnatt. */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** Minutter siden midnatt for `now`. */
function minutesSinceMidnight(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

/**
 * Returnerer kun de besøk som er innenfor velkomstvinduet akkurat nå
 * (60 min før start → 15 min etter end_time, eller etter start_time hvis
 * end_time mangler), sortert etter start_time.
 *
 * Brukes av Velkomst-slide F på TV-dashbordet til å avgjøre om/hvilke
 * besøk som skal vises som hero-velkomst akkurat dette minuttet.
 */
export function filterActiveWelcomes(visits: Visit[], time: Date): Visit[] {
  const todayStr = toDateString(time)
  const nowMin = minutesSinceMidnight(time)
  return visits
    .filter(v => v.date === todayStr)
    .filter(v => {
      const startMin = timeToMinutes(v.start_time)
      const endMin = v.end_time ? timeToMinutes(v.end_time) : startMin
      return (
        nowMin >= startMin - WELCOME_PRE_WINDOW_MIN &&
        nowMin <= endMin + WELCOME_POST_WINDOW_MIN
      )
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
}

/**
 * Henter dagens besøk for orgIds, sortert etter start_time, med live
 * Realtime-subscription per workspace (samme mønster som useEntries).
 *
 * Returnerer HELE dagen — bruk `filterActiveWelcomes(visits, time)`
 * hvis du vil ha kun de som er innenfor velkomstvinduet (TV-slide F).
 *
 * Pauser subscription når fanen er skjult, og catch-up-fetcher ved
 * resume så TV/forsiden alltid er synkron etter at noen kommer
 * tilbake. Refetcher også ved midnattskryss.
 */
export function useTodaysVisits(
  orgIdOrIds: string | string[],
  opts: { initial?: Visit[] } = {},
): Visit[] {
  const orgIds = useMemo(
    () => (Array.isArray(orgIdOrIds) ? orgIdOrIds : [orgIdOrIds]),
    [orgIdOrIds],
  )
  const orgIdsKey = orgIds.join(',')
  const visible = useDocumentVisibility()

  const [visits, setVisits] = useState<Visit[]>(opts.initial ?? [])
  const wasHiddenRef = useRef(false)
  // Track whether we still hold the SSR-seeded value so we can skip the
  // first client fetch — same trick as useEntries — and avoid a flash
  // of empty rail before the first realtime payload arrives.
  const initialSeed = useRef(opts.initial !== undefined)

  const fetchToday = useCallback(async () => {
    const supabase = createClient()
    const today = toDateString(new Date())
    const { data } = await supabase
      .from('visits')
      .select('*')
      .in('org_id', orgIds)
      .eq('date', today)
      .order('start_time', { ascending: true })
    setVisits(data ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey])

  useEffect(() => {
    if (initialSeed.current) {
      initialSeed.current = false
      return
    }
    fetchToday()
  }, [fetchToday])

  useEffect(() => {
    if (!visible) {
      wasHiddenRef.current = true
      return
    }
    const supabase = createClient()
    const channels = orgIds.map((id) =>
      supabase
        .channel(`visits:org:${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'visits',
            filter: `org_id=eq.${id}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as Partial<Visit>
              if (!deleted.id) return
              setVisits(prev => prev.filter(v => v.id !== deleted.id))
              return
            }
            const upserted = payload.new as Visit
            if (!upserted?.id) return
            // Filtrer bort besøk som ikke er for i dag — historikk og
            // fremtidige dager er ikke aktuelle for hverken TV eller rail.
            const today = toDateString(new Date())
            if (upserted.date !== today) {
              setVisits(prev => prev.filter(v => v.id !== upserted.id))
              return
            }
            setVisits(prev => {
              const without = prev.filter(v => v.id !== upserted.id)
              return [...without, upserted].sort((a, b) =>
                a.start_time.localeCompare(b.start_time)
              )
            })
          }
        )
        .subscribe(),
    )
    if (wasHiddenRef.current) {
      wasHiddenRef.current = false
      fetchToday()
    }
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey, visible, fetchToday])

  return visits
}
