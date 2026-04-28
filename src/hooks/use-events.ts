'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OrgEvent } from '@/lib/supabase/types'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'

/**
 * Fetches org events overlapping the given year, and subscribes to
 * Supabase Realtime so the wheel/calendar/list stays live.
 */
export function useEvents(orgId: string, year: number) {
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [loading, setLoading] = useState(true)
  const visible = useDocumentVisibility()
  const wasHiddenRef = useRef(false)

  const fetchEvents = useCallback(async () => {
    const supabase = createClient()
    // Events that overlap the year window: start on/before Dec 31 AND
    // end on/after Jan 1. The prior `.or()` filter accepted any event whose
    // start OR end matched — which pulled in past and future years too.
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .lte('start_date', `${year}-12-31`)
      .gte('end_date', `${year}-01-01`)
      .order('start_date')
    setEvents(data ?? [])
    setLoading(false)
  }, [orgId, year])

  useEffect(() => {
    setLoading(true)
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    if (!visible) {
      wasHiddenRef.current = true
      return
    }
    const supabase = createClient()
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const inYear = (ev: OrgEvent | undefined) =>
      !!ev && ev.start_date <= yearEnd && ev.end_date >= yearStart

    function upsertHandler(payload: { new: OrgEvent }) {
      const upserted = payload.new
      if (upserted.org_id !== orgId) return
      if (!inYear(upserted)) {
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

    // Three separate .on()s because DELETE needs a different filter strategy:
    // server-side `org_id=eq.X` works on INSERT/UPDATE (new row contains org_id)
    // but not on DELETE — with REPLICA IDENTITY DEFAULT, the "old" record only
    // contains the primary key, so the filter never matches and the event is
    // silently dropped. For DELETE we subscribe globally and filter by whether
    // the id is in our local state (we only ever have our own org's ids).
    const channel = supabase
      .channel(`events:org:${orgId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` }, upsertHandler)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` }, upsertHandler)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'events' }, (payload) => {
        const deletedId = (payload.old as Partial<OrgEvent>)?.id
        if (!deletedId) return
        setEvents(prev => prev.filter(e => e.id !== deletedId))
      })
      .subscribe()
    if (wasHiddenRef.current) {
      wasHiddenRef.current = false
      fetchEvents()
    }

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, year, visible, fetchEvents])

  return { events, loading, refetch: fetchEvents }
}
