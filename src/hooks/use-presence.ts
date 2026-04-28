'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'

/**
 * Supabase Realtime presence — broadcasts "who's online" for an org via a
 * channel keyed on org_id. Each browser tab picks a unique key so two tabs
 * of the same member don't overwrite each other in the presence map.
 */

export interface PresenceState {
  member_id: string
  display_name: string
  avatar_url: string | null
  initials: string | null
  /** Current route ("/", "/min-plan", …). */
  page: string
  /** What the user is currently editing. Null when idle. */
  editing?: {
    kind: 'cell'
    member_id: string
    date: string
  } | null
  /** Wall-clock ms when this state was broadcast. */
  last_seen: number
}

interface UsePresenceParams {
  orgId: string | null
  me: {
    id: string
    display_name: string
    avatar_url: string | null
    initials: string | null
  } | null
  /** Route the user is currently viewing. */
  page: string
}

export interface UsePresenceResult {
  /** Every tracked session on this channel, excluding our own tab's key. */
  others: PresenceState[]
  /** What the server currently knows about us. */
  mine: PresenceState | null
  /** Update our "editing" field. Pass null to clear. */
  setEditing: (editing: PresenceState['editing']) => void
}

export function usePresence({ orgId, me, page }: UsePresenceParams): UsePresenceResult {
  const [others, setOthers] = useState<PresenceState[]>([])
  const [mine, setMine] = useState<PresenceState | null>(null)
  const visible = useDocumentVisibility()

  const tabKeyRef = useRef<string>('')
  if (!tabKeyRef.current) tabKeyRef.current = cryptoKey()

  const channelRef = useRef<RealtimeChannel | null>(null)
  const editingRef = useRef<PresenceState['editing']>(null)
  // Identity snapshot so the track() callback can read fresh values without
  // forcing the subscribe effect to re-run and re-subscribe.
  const meRef = useRef(me)
  const pageRef = useRef(page)
  useEffect(() => { meRef.current = me }, [me])
  useEffect(() => { pageRef.current = page }, [page])

  // Subscribe once per org — re-subscribe when orgId or memberId changes.
  // Skip while the tab is hidden so we drop our own presence broadcast and
  // stop decoding everyone else's. We re-subscribe (and reappear) on resume.
  useEffect(() => {
    if (!orgId || !me || !visible) return
    const supabase = createClient()
    const tabKey = tabKeyRef.current
    const channel = supabase.channel(`presence:org:${orgId}`, {
      config: { presence: { key: tabKey } },
    })
    channelRef.current = channel

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceState>()
      const myGroup = state[tabKey] ?? []
      const othersFlat: PresenceState[] = []
      for (const key in state) {
        if (key === tabKey) continue
        for (const entry of state[key]) othersFlat.push(entry)
      }
      setOthers(othersFlat)
      setMine(myGroup[0] ?? null)
    })

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      const current = meRef.current
      if (!current) return
      await channel.track({
        member_id: current.id,
        display_name: current.display_name,
        avatar_url: current.avatar_url,
        initials: current.initials,
        page: pageRef.current,
        editing: editingRef.current ?? null,
        last_seen: Date.now(),
      } satisfies PresenceState)
    })

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId, me?.id, visible])

  // Re-track whenever the page changes without tearing down the channel.
  useEffect(() => {
    const channel = channelRef.current
    const current = meRef.current
    if (!channel || !current) return
    channel.track({
      member_id: current.id,
      display_name: current.display_name,
      avatar_url: current.avatar_url,
      initials: current.initials,
      page,
      editing: editingRef.current ?? null,
      last_seen: Date.now(),
    } satisfies PresenceState)
  }, [page])

  const setEditing = useCallback((editing: PresenceState['editing']) => {
    editingRef.current = editing ?? null
    const channel = channelRef.current
    const current = meRef.current
    if (!channel || !current) return
    channel.track({
      member_id: current.id,
      display_name: current.display_name,
      avatar_url: current.avatar_url,
      initials: current.initials,
      page: pageRef.current,
      editing: editing ?? null,
      last_seen: Date.now(),
    } satisfies PresenceState)
  }, [])

  return { others, mine, setEditing }
}

function cryptoKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
