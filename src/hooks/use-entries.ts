'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Entry } from '@/lib/supabase/types'

/**
 * Fetches entries for the given org + date strings, and subscribes to
 * Supabase Realtime to keep the data live.
 */
export function useEntries(orgId: string, dateStrings: string[]) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  // Keep a ref to the current date strings so the realtime callback
  // can check relevance without a stale closure.
  const dateStringsRef = useRef(dateStrings)
  useEffect(() => {
    dateStringsRef.current = dateStrings
  })

  // Re-fetch whenever the visible date range changes
  const fetchEntries = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('entries')
      .select('*')
      .eq('org_id', orgId)
      .in('date', dateStrings)
    setEntries(data ?? [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, dateStrings.join(',')])

  useEffect(() => {
    setLoading(true)
    fetchEntries()
  }, [fetchEntries])

  // Refetch on explicit broadcast — AIInput emits this after a successful
  // parse since realtime can lag or drop events on reconnect. This keeps
  // the matrix and the "Akkurat nå" widget in lockstep with what the user
  // just typed.
  useEffect(() => {
    const handler = () => fetchEntries()
    window.addEventListener('teampulse:entries-changed', handler)
    return () => window.removeEventListener('teampulse:entries-changed', handler)
  }, [fetchEntries])

  // Subscribe to Realtime changes for this org — one subscription per orgId
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`entries:org:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          // DELETE: payload.old may only contain the primary key when the
          // table uses the default REPLICA IDENTITY, so fall back to removing
          // by id alone and skip the date-window check.
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Partial<Entry>
            if (!deleted.id) return
            setEntries(prev => prev.filter(e => e.id !== deleted.id))
            return
          }
          const upserted = payload.new as Entry
          if (!upserted?.date || !dateStringsRef.current.includes(upserted.date)) return
          setEntries(prev => {
            const without = prev.filter(e => e.id !== upserted.id)
            return [...without, upserted]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId])

  return { entries, loading, refetch: fetchEntries }
}
