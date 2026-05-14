'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { usePresence, type PresenceState } from '@/hooks/use-presence'

export interface PresenceMe {
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

export function PresenceProvider({
  children,
  initialMe,
}: {
  children: React.ReactNode
  /**
   * Pre-loaded "me" from SSR session — saves the two sequential round-trips
   * (auth.getUser + members lookup) that used to delay presence subscription
   * by ~150-300ms after every page load. Sources of truth (admin re-link
   * fallback, user_id backfill) still live in `getSessionMember`, so we just
   * trust whatever it gives us here.
   */
  initialMe: PresenceMe | null
}) {
  // Seed once from SSR; subsequent page navigations within the same session
  // keep using the seeded value (it doesn't change without a reload).
  const [me] = useState<PresenceMe | null>(initialMe)
  const pathname = usePathname()

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
