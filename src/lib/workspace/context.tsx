'use client'

import { createContext, useContext, useEffect, useMemo, useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n/context'
import type { WorkspaceSummary } from '@/lib/supabase/types'

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[]
  active: WorkspaceSummary | null
  isSwitching: boolean
  /** Fire-and-forget switch; UI is updated optimistically. */
  switchTo: (slug: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  initialWorkspaces,
  initialActiveSlug,
  children,
}: {
  initialWorkspaces: WorkspaceSummary[]
  initialActiveSlug: string | null
  children: React.ReactNode
}) {
  const router = useRouter()
  const t = useT()
  const [isPending, startTransition] = useTransition()
  // Track optimistic target so the pill updates instantly without
  // waiting for the server round-trip + RSC re-render.
  const [optimisticSlug, setOptimisticSlug] = useState<string | null>(null)

  const activeSlug = optimisticSlug ?? initialActiveSlug
  const active = useMemo(
    () => initialWorkspaces.find((w) => w.slug === activeSlug) ?? initialWorkspaces[0] ?? null,
    [initialWorkspaces, activeSlug],
  )

  // Once the server round-trip + refresh has landed and the cookie-backed
  // active slug matches our optimistic target, drop the optimistic state so
  // `isSwitching` returns to false. Without this, the pill stays dimmed and
  // re-runs its opacity transition on every subsequent render.
  useEffect(() => {
    if (optimisticSlug !== null && initialActiveSlug === optimisticSlug) {
      setOptimisticSlug(null)
    }
  }, [initialActiveSlug, optimisticSlug])

  const switchTo = useCallback(
    async (slug: string) => {
      if (!slug || slug === active?.slug) return
      const target = initialWorkspaces.find((w) => w.slug === slug)
      if (!target) return

      setOptimisticSlug(slug)
      try {
        const res = await fetch('/api/workspace/switch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug }),
        })
        if (!res.ok) {
          setOptimisticSlug(null)
          toast.error(t.workspace.switchFailed)
          return
        }
        toast.success(`${t.workspace.switched} ${target.name}`)
        // Force the RSC tree to re-render so server components
        // pick up the new cookie and re-scope their queries.
        startTransition(() => {
          router.refresh()
        })
      } catch {
        setOptimisticSlug(null)
        toast.error(t.workspace.switchFailed)
      }
    },
    [active?.slug, initialWorkspaces, router],
  )

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces: initialWorkspaces,
      active,
      isSwitching: isPending || optimisticSlug !== null,
      switchTo,
    }),
    [initialWorkspaces, active, isPending, optimisticSlug, switchTo],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    // Tolerant fallback for components mounted outside the provider
    // (e.g. on the login screen). Returns an empty list.
    return {
      workspaces: [],
      active: null,
      isSwitching: false,
      switchTo: async () => {},
    }
  }
  return ctx
}
