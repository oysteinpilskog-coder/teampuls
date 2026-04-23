'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePresence, type PresenceState } from '@/hooks/use-presence'

interface Me {
  id: string
  orgId: string
  display_name: string
  avatar_url: string | null
  initials: string | null
}

interface PresenceCtx {
  others: PresenceState[]
  mine: PresenceState | null
  setEditing: (editing: PresenceState['editing']) => void
  /** Returns every other session currently editing a specific cell. */
  editorsOf: (memberId: string, date: string) => PresenceState[]
}

const Ctx = createContext<PresenceCtx>({
  others: [],
  mine: null,
  setEditing: () => {},
  editorsOf: () => [],
})

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const pathname = usePathname()

  // Resolve "me" once on mount — we need the active member record to know
  // who to broadcast as. Fetched client-side because this provider lives
  // inside a client boundary.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('members')
        .select('id, org_id, display_name, avatar_url, initials')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (cancelled || !member) return
      setMe({
        id: member.id,
        orgId: member.org_id,
        display_name: member.display_name,
        avatar_url: member.avatar_url,
        initials: member.initials,
      })
    }
    load()
    return () => { cancelled = true }
  }, [])

  const { others, mine, setEditing } = usePresence({
    orgId: me?.orgId ?? null,
    me: me
      ? {
          id: me.id,
          display_name: me.display_name,
          avatar_url: me.avatar_url,
          initials: me.initials,
        }
      : null,
    page: pathname,
  })

  const value = useMemo<PresenceCtx>(
    () => ({
      others,
      mine,
      setEditing,
      editorsOf: (memberId, date) =>
        others.filter(
          (o) =>
            o.editing?.kind === 'cell' &&
            o.editing.member_id === memberId &&
            o.editing.date === date,
        ),
    }),
    [others, mine, setEditing],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePresenceCtx(): PresenceCtx {
  return useContext(Ctx)
}
