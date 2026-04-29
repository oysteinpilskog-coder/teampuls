'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Visit } from '@/lib/supabase/types'
import { toDateString } from '@/lib/dates'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'

// Velkomst-vinduet: 60 minutter før til 15 minutter etter start_time.
// Avklart med eier — gir nok ledetid for tidlige kunder uten å gjøre
// slide til konstant bakgrunn på en TV som står hele dagen.
const PRE_WINDOW_MIN = 60
const POST_WINDOW_MIN = 15

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
 * Returnerer alle dagens besøk hvor `now` ligger innenfor velkomstvinduet,
 * sortert etter start_time. Tom array = ingen velkomst-slide skal vises.
 *
 * Henter dagens visits ved mount, abonnerer på Realtime per workspace, og
 * pauser subscription når fanen er skjult (samme mønster som useEntries).
 * Bruker `time` som et tikkende referansepunkt slik at velkomsten dukker
 * opp i det riktige minuttet uten egen timer her — DashboardClient eier
 * allerede en sekund-klokke vi gjenbruker.
 */
export function useActiveWelcomes(orgIdOrIds: string | string[], time: Date): Visit[] {
  const orgIds = useMemo(
    () => (Array.isArray(orgIdOrIds) ? orgIdOrIds : [orgIdOrIds]),
    [orgIdOrIds],
  )
  const orgIdsKey = orgIds.join(',')
  const visible = useDocumentVisibility()

  const [visits, setVisits] = useState<Visit[]>([])
  const wasHiddenRef = useRef(false)

  const fetchToday = useCallback(async () => {
    const supabase = createClient()
    const today = toDateString(new Date())
    const { data } = await supabase
      .from('visits')
      .select('*')
      .in('org_id', orgIds)
      .eq('date', today)
    setVisits(data ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey])

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  // Refetch ved midnattskryss — dagens besøk endrer seg.
  const dayKey = toDateString(time)
  useEffect(() => {
    fetchToday()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey])

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
            // Filtrer bort besøk som ikke er for i dag — vi bryr oss ikke
            // om historikk eller fremtidige dager på TV-en.
            const today = toDateString(new Date())
            if (upserted.date !== today) {
              setVisits(prev => prev.filter(v => v.id !== upserted.id))
              return
            }
            setVisits(prev => {
              const without = prev.filter(v => v.id !== upserted.id)
              return [...without, upserted]
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

  // Filtrer ned til de som er innenfor sitt vindu akkurat nå. Beregnes
  // hver gang `time` endrer seg (1 Hz fra DashboardClient), slik at slide
  // dukker opp/forsvinner i riktig minutt uten egen ticker her.
  return useMemo(() => {
    const todayStr = toDateString(time)
    const nowMin = minutesSinceMidnight(time)
    return visits
      .filter(v => v.date === todayStr)
      .filter(v => {
        const startMin = timeToMinutes(v.start_time)
        return nowMin >= startMin - PRE_WINDOW_MIN && nowMin <= startMin + POST_WINDOW_MIN
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  }, [visits, time])
}
