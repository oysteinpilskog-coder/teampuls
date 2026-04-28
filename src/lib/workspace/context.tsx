'use client'

import { createContext, useContext, useEffect, useMemo, useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n/context'
import type { WorkspaceSummary } from '@/lib/supabase/types'

/** Sentinel slug — must match COMBINED_WORKSPACE_SLUG in session.ts. */
export const COMBINED_SLUG = '__all__'

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[]
  active: WorkspaceSummary | null
  isSwitching: boolean
  /** True when active.slug === COMBINED_SLUG, i.e. cross-workspace view. */
  isCombined: boolean
  /** Fire-and-forget switch; UI is updated optimistically. */
  switchTo: (slug: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  initialWorkspaces,
  initialActiveSlug,
  initialCombinedActive,
  children,
}: {
  initialWorkspaces: WorkspaceSummary[]
  initialActiveSlug: string | null
  /** When true, the synthetic "Alle CalWin" workspace is the active surface. */
  initialCombinedActive?: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const t = useT()
  const [isPending, startTransition] = useTransition()
  // Track optimistic target so the pill updates instantly without
  // waiting for the server round-trip + RSC re-render.
  const [optimisticSlug, setOptimisticSlug] = useState<string | null>(null)

  const activeSlug = optimisticSlug ?? initialActiveSlug
  // Synthesize a combined-view summary client-side so the pill renders
  // the violet badge and the "Alle CalWin" name without needing the
  // server to inject one.
  const combinedSummary = useMemo<WorkspaceSummary | null>(() => {
    if (initialWorkspaces.length < 2) return null
    const accountIds = new Set(initialWorkspaces.map((w) => w.account_id).filter((x): x is string => !!x))
    if (accountIds.size !== 1) return null
    return {
      org_id: '__combined__',
      account_id: [...accountIds][0],
      name: t.workspace.combinedAll,
      slug: COMBINED_SLUG,
      short_name: 'ALL',
      region: initialWorkspaces[0].region,
      country_code: null,
      accent_color: '#7C3AED',
      logo_url: null,
      role: 'admin',
    } as WorkspaceSummary
  }, [initialWorkspaces, t.workspace.combinedAll])

  const active = useMemo(() => {
    if (activeSlug === COMBINED_SLUG && combinedSummary) return combinedSummary
    return initialWorkspaces.find((w) => w.slug === activeSlug) ?? initialWorkspaces[0] ?? null
  }, [initialWorkspaces, activeSlug, combinedSummary])

  const isCombined = active?.slug === COMBINED_SLUG

  // Once the server round-trip + refresh has landed and the cookie-backed
  // active slug matches our optimistic target, drop the optimistic state so
  // `isSwitching` returns to false. Without this, the pill stays dimmed and
  // re-runs its opacity transition on every subsequent render.
  useEffect(() => {
    if (optimisticSlug !== null && initialActiveSlug === optimisticSlug) {
      setOptimisticSlug(null)
    }
  }, [initialActiveSlug, optimisticSlug])

  // Push the active workspace's accent into --accent-color on <body> the
  // moment we switch, so the page tint updates instantly instead of
  // waiting for the RSC refresh to repaint server-rendered styles.
  useEffect(() => {
    const hex = active?.accent_color?.match(/^#[0-9a-fA-F]{3,8}$/)?.[0]
    const body = document.body
    if (!hex) {
      body.style.removeProperty('--accent-color')
      body.style.removeProperty('--accent-glow')
      body.style.removeProperty('--workspace-accent-color')
      body.style.removeProperty('--aurora-a')
      return
    }
    body.style.setProperty('--workspace-accent-color', hex)
    body.style.setProperty('--accent-color', hex)
    body.style.setProperty('--accent-glow', `color-mix(in oklab, ${hex} 35%, transparent)`)
    body.style.setProperty('--aurora-a', `color-mix(in oklab, ${hex} 32%, transparent)`)
  }, [active?.accent_color])

  const switchTo = useCallback(
    async (slug: string) => {
      if (!slug || slug === active?.slug) return
      const target =
        slug === COMBINED_SLUG
          ? combinedSummary
          : initialWorkspaces.find((w) => w.slug === slug)
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
    [active?.slug, initialWorkspaces, combinedSummary, router, t.workspace],
  )

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces: initialWorkspaces,
      active,
      isSwitching: isPending || optimisticSlug !== null,
      isCombined,
      switchTo,
    }),
    [initialWorkspaces, active, isPending, optimisticSlug, isCombined, switchTo],
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
      isCombined: false,
      switchTo: async () => {},
    }
  }
  return ctx
}
