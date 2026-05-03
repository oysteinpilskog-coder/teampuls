'use client'

import { useCallback, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { YearWheel } from '@/components/year-wheel'
import { BirthdayWheel } from '@/components/birthday-wheel'
import { AnniversaryWheel } from '@/components/anniversary-wheel'
import { AnniversaryTimeline } from '@/components/anniversary-timeline'
import { StrategyWheel } from '@/components/strategy-wheel'
import { WheelViewSwitcher, type WheelView, type AnniversarySub } from '@/components/wheel-view-switcher'

export function WheelShell({
  orgId, birthdaysEnabled, anniversariesEnabled, strategiesEnabled,
}: {
  orgId: string
  birthdaysEnabled: boolean
  anniversariesEnabled: boolean
  strategiesEnabled: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const requested = (params.get('view') ?? 'events') as WheelView
  const view: WheelView =
    requested === 'birthdays' && !birthdaysEnabled ? 'events'
    : requested === 'anniversaries' && !anniversariesEnabled ? 'events'
    : requested === 'strategy' && !strategiesEnabled ? 'events'
    : (['events', 'birthdays', 'anniversaries', 'strategy'] as const).includes(requested)
      ? requested
      : 'events'

  const sub = (params.get('ansiennitet') ?? 'wheel') as AnniversarySub

  // Self-correct the URL if the user landed on a disabled view.
  useEffect(() => {
    if (requested !== view) {
      const next = new URLSearchParams(params.toString())
      next.set('view', view)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    }
  }, [requested, view, params, router, pathname])

  const setView = useCallback((v: WheelView) => {
    const next = new URLSearchParams(params.toString())
    if (v === 'events') next.delete('view')
    else next.set('view', v)
    if (v !== 'anniversaries') next.delete('ansiennitet')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, router, pathname])

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
    return <motion.div key="events" {...fade}><YearWheel orgId={orgId} /></motion.div>
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <WheelViewSwitcher
        value={view}
        sub={sub}
        onView={setView}
        onSub={setSub}
        available={{
          events: true,
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
