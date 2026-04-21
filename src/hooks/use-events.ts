'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OrgEvent } from '@/lib/supabase/types'

/**
 * Fetches org events overlapping the given year, and subscribes to
 * Supabase Realtime so the wheel/calendar/list stays live.
 */
export function useEvents(orgId: string, year: number) {
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .or(`start_date.gte.${year}-01-01,end_date.lte.${year}-12-31`)
      .order('start_date')
    setEvents(data ?? [])
    setLoading(false)
  }, [orgId, year])

  useEffect(() => {
    setLoading(true)
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    const supabase = createClient()
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const inYear = (ev: OrgEvent | undefined) =>
      !!ev && ev.start_date <= yearEnd && ev.end_date >= yearStart

    const channel = supabase
      .channel(`events:org:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as OrgEvent
            setEvents(prev => prev.filter(e => e.id !== deleted.id))
            return
          }

          const upserted = payload.new as OrgEvent
          if (!inYear(upserted)) {
            // Event moved out of the visible year — drop it if present
            setEvents(prev => prev.filter(e => e.id !== upserted.id))
            return
          }

          setEvents(prev => {
            const without = prev.filter(e => e.id !== upserted.id)
            const next = [...without, upserted]
            next.sort((a, b) => a.start_date.localeCompare(b.start_date))
            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, year])

  return { events, loading, refetch: fetchEvents }
}
