'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { YearWheel } from '@/components/year-wheel'
import { BirthdayWheel } from '@/components/birthday-wheel'
import { AnniversaryWheel } from '@/components/anniversary-wheel'
import { AnniversaryTimeline } from '@/components/anniversary-timeline'
import { StrategyWheel } from '@/components/strategy-wheel'
import { WheelViewSwitcher, type WheelView, type AnniversarySub } from '@/components/wheel-view-switcher'

export function WheelShell({
  orgId,
  eventsEnabled,
  birthdaysEnabled,
  anniversariesEnabled,
  strategiesEnabled,
  defaultView,
}: {
  orgId: string
  eventsEnabled: boolean
  birthdaysEnabled: boolean
  anniversariesEnabled: boolean
  strategiesEnabled: boolean
  defaultView: WheelView
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Pick the first enabled view in canonical tab order — used both as a
  // fallback when the saved default is disabled and when the URL points
  // at a disabled tab.
  const fallbackView: WheelView = useMemo(() => {
    if (eventsEnabled) return 'events'
    if (strategiesEnabled) return 'strategy'
    if (birthdaysEnabled) return 'birthdays'
    if (anniversariesEnabled) return 'anniversaries'
    return 'events'
  }, [eventsEnabled, strategiesEnabled, birthdaysEnabled, anniversariesEnabled])

  const isAvailable = useCallback(
    (v: WheelView) =>
      v === 'events' ? eventsEnabled
      : v === 'birthdays' ? birthdaysEnabled
      : v === 'anniversaries' ? anniversariesEnabled
      : v === 'strategy' ? strategiesEnabled
      : false,
    [eventsEnabled, birthdaysEnabled, anniversariesEnabled, strategiesEnabled]
  )

  const requestedRaw = params.get('view') as WheelView | null
  // No ?view= → use the org's saved default. If that's disabled, fall back.
  const requested: WheelView = requestedRaw && isAvailable(requestedRaw)
    ? requestedRaw
    : isAvailable(defaultView)
      ? defaultView
      : fallbackView

  const view: WheelView = isAvailable(requested) ? requested : fallbackView

  const sub = (params.get('ansiennitet') ?? 'wheel') as AnniversarySub

  // Self-correct the URL if the user landed on a disabled view (e.g. an
  // old bookmark, or because the org admin just turned it off).
  useEffect(() => {
    if (requestedRaw && requestedRaw !== view) {
      const next = new URLSearchParams(params.toString())
      next.set('view', view)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    }
  }, [requestedRaw, view, params, router, pathname])

  const setView = useCallback((v: WheelView) => {
    const next = new URLSearchParams(params.toString())
    if (v === defaultView) next.delete('view')
    else next.set('view', v)
    if (v !== 'anniversaries') next.delete('ansiennitet')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, router, pathname, defaultView])

  const setSub = useCallback((s: AnniversarySub) => {
    const next = new URLSearchParams(params.toString())
    if (s === 'wheel') next.delete('ansiennitet')
    else next.set('ansiennitet', s)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, router, pathname])

  const renderView = () => {
    if (view === 'birthdays' && birthdaysEnabled) {
      return <motion.div key="birthdays" {...fade}><BirthdayWheel orgId={orgId} /></motion.div>
    }
    if (view === 'anniversaries' && anniversariesEnabled) {
      return sub === 'timeline'
        ? <motion.div key="anniversaries-timeline" {...fade}><AnniversaryTimeline orgId={orgId} /></motion.div>
        : <motion.div key="anniversaries-wheel" {...fade}><AnniversaryWheel orgId={orgId} /></motion.div>
    }
    if (view === 'strategy' && strategiesEnabled) {
      return <motion.div key="strategy" {...fade}><StrategyWheel orgId={orgId} /></motion.div>
    }
    if (view === 'events' && eventsEnabled) {
      return <motion.div key="events" {...fade}><YearWheel orgId={orgId} /></motion.div>
    }
    // No tab is enabled — admins shouldn't be able to reach this state from
    // /settings/wheel (the last tab is locked on), but render an empty shell
    // just in case the DB drifts.
    return null
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <WheelViewSwitcher
        value={view}
        sub={sub}
        onView={setView}
        onSub={setSub}
        available={{
          events: eventsEnabled,
          birthdays: birthdaysEnabled,
          anniversaries: anniversariesEnabled,
          strategy: strategiesEnabled,
        }}
      />
      <div className="w-full">
        <AnimatePresence mode="wait">
          {renderView()}
        </AnimatePresence>
      </div>
    </div>
  )
}

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.28 },
}
