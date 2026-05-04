'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import type { Organization } from '@/lib/supabase/types'
import type { WheelView } from '@/components/wheel-view-switcher'

type WheelToggleKey = 'events' | 'strategies' | 'birthdays' | 'anniversaries'

const VIEW_KEY_BY_TOGGLE: Record<WheelToggleKey, WheelView> = {
  events: 'events',
  strategies: 'strategy',
  birthdays: 'birthdays',
  anniversaries: 'anniversaries',
}

const TOGGLE_BY_VIEW_KEY: Record<WheelView, WheelToggleKey> = {
  events: 'events',
  strategy: 'strategies',
  birthdays: 'birthdays',
  anniversaries: 'anniversaries',
}

const TOGGLE_ORDER: WheelToggleKey[] = ['events', 'strategies', 'birthdays', 'anniversaries']

export function WheelSettingsClient({ org: initialOrg }: { org: Organization }) {
  const t = useT()
  const [org, setOrg] = useState(initialOrg)

  const [eventsEnabled, setEventsEnabled] = useState<boolean>(initialOrg.events_enabled ?? true)
  const [strategiesEnabled, setStrategiesEnabled] = useState<boolean>(initialOrg.strategies_enabled ?? true)
  const [birthdaysEnabled, setBirthdaysEnabled] = useState<boolean>(initialOrg.birthdays_enabled ?? true)
  const [anniversariesEnabled, setAnniversariesEnabled] = useState<boolean>(initialOrg.anniversaries_enabled ?? true)
  const [defaultView, setDefaultView] = useState<WheelView>(
    (initialOrg.wheel_default_view as WheelView | undefined) ?? 'events'
  )
  const [saving, setSaving] = useState(false)

  const flags: Record<WheelToggleKey, boolean> = {
    events: eventsEnabled,
    strategies: strategiesEnabled,
    birthdays: birthdaysEnabled,
    anniversaries: anniversariesEnabled,
  }

  // The dashboard needs at least one tab — the last enabled one stays locked.
  const enabledCount = TOGGLE_ORDER.reduce((n, k) => (flags[k] ? n + 1 : n), 0)
  const isLastOne = enabledCount === 1

  const setters: Record<WheelToggleKey, (v: boolean) => void> = {
    events: setEventsEnabled,
    strategies: setStrategiesEnabled,
    birthdays: setBirthdaysEnabled,
    anniversaries: setAnniversariesEnabled,
  }

  const labels: Record<WheelToggleKey, { label: string; hint: string }> = {
    events: { label: t.settings.wheel.eventsEnabled, hint: t.settings.wheel.eventsEnabledDesc },
    strategies: { label: t.settings.wheel.strategiesEnabled, hint: t.settings.wheel.strategiesEnabledDesc },
    birthdays: { label: t.settings.wheel.birthdaysEnabled, hint: t.settings.wheel.birthdaysEnabledDesc },
    anniversaries: { label: t.settings.wheel.anniversariesEnabled, hint: t.settings.wheel.anniversariesEnabledDesc },
  }

  // Default view picker can only point at an enabled tab. If the user disabled
  // the tab their saved default pointed at, fall the picker over to the first
  // remaining enabled tab — same fallback as WheelShell uses at runtime.
  const enabledViews = useMemo<WheelView[]>(
    () => TOGGLE_ORDER.filter(k => flags[k]).map(k => VIEW_KEY_BY_TOGGLE[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventsEnabled, strategiesEnabled, birthdaysEnabled, anniversariesEnabled]
  )
  const effectiveDefault: WheelView = enabledViews.includes(defaultView)
    ? defaultView
    : enabledViews[0] ?? 'events'

  const isDirty =
    eventsEnabled !== (org.events_enabled ?? true) ||
    strategiesEnabled !== (org.strategies_enabled ?? true) ||
    birthdaysEnabled !== (org.birthdays_enabled ?? true) ||
    anniversariesEnabled !== (org.anniversaries_enabled ?? true) ||
    effectiveDefault !== ((org.wheel_default_view as WheelView | undefined) ?? 'events')

  async function handleSave() {
    if (!isDirty || saving) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('organizations')
      .update({
        events_enabled: eventsEnabled,
        strategies_enabled: strategiesEnabled,
        birthdays_enabled: birthdaysEnabled,
        anniversaries_enabled: anniversariesEnabled,
        wheel_default_view: effectiveDefault,
      })
      .eq('id', org.id)
    setSaving(false)
    if (error) {
      console.error('[settings/wheel] save failed:', error)
      toast.error(`${t.common.error} (${error.code ?? 'ukjent'}: ${error.message})`)
      return
    }
    setOrg(o => ({
      ...o,
      events_enabled: eventsEnabled,
      strategies_enabled: strategiesEnabled,
      birthdays_enabled: birthdaysEnabled,
      anniversaries_enabled: anniversariesEnabled,
      wheel_default_view: effectiveDefault,
    }))
    setDefaultView(effectiveDefault)
    toast.success(t.settings.wheel.saved)
  }

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-[24px] font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
        >
          {t.settings.wheel.title}
        </h1>
        <p
          className="text-[14px] mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.settings.wheel.subtitle}
        </p>
      </div>

      <div
        className="rounded-2xl p-6 flex flex-col gap-5"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <SettingsField label={t.settings.wheel.viewsLabel} description={t.settings.wheel.viewsDesc}>
          <div className="flex flex-col gap-2">
            {TOGGLE_ORDER.map(key => {
              const checked = flags[key]
              const locked = checked && isLastOne
              return (
                <ToggleRow
                  key={key}
                  label={labels[key].label}
                  hint={labels[key].hint}
                  checked={checked}
                  disabled={locked}
                  onChange={v => setters[key](v)}
                />
              )
            })}
            {isLastOne && (
              <p
                className="text-[11.5px] mt-1"
                style={{ color: 'var(--lg-text-3, var(--text-tertiary))', fontFamily: 'var(--font-body)' }}
              >
                {t.settings.wheel.minOneActive}
              </p>
            )}
          </div>
        </SettingsField>

        <SettingsField
          label={t.settings.wheel.defaultViewLabel}
          description={t.settings.wheel.defaultViewDesc}
        >
          <div className="flex flex-wrap gap-2">
            {enabledViews.map(view => {
              const toggleKey = TOGGLE_BY_VIEW_KEY[view]
              const active = view === effectiveDefault
              return (
                <button
                  key={view}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDefaultView(view)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-[background,border-color] duration-150"
                  style={{
                    background: active
                      ? 'color-mix(in oklab, var(--lg-accent) 12%, transparent)'
                      : 'var(--lg-surface-2, var(--bg-subtle))',
                    border: `1px solid ${active ? 'color-mix(in oklab, var(--lg-accent) 45%, transparent)' : 'var(--lg-divider, var(--border-subtle))'}`,
                    color: active ? 'var(--lg-text-1, var(--text-primary))' : 'var(--lg-text-2, var(--text-secondary))',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center rounded-full shrink-0"
                    style={{
                      width: 14,
                      height: 14,
                      background: active ? 'var(--lg-accent)' : 'transparent',
                      boxShadow: active
                        ? '0 0 0 3px color-mix(in oklab, var(--lg-accent) 18%, transparent), 0 0 10px var(--lg-accent-glow)'
                        : `inset 0 0 0 1.5px var(--lg-divider, var(--border-subtle))`,
                    }}
                  >
                    {active && (
                      <span className="rounded-full" style={{ width: 5, height: 5, background: '#ffffff' }} />
                    )}
                  </span>
                  {labels[toggleKey].label}
                </button>
              )
            })}
          </div>
        </SettingsField>

        <div className="flex justify-end pt-2">
          <motion.button
            onClick={handleSave}
            disabled={!isDirty || saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={spring.snappy}
            className="px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
          >
            {saving ? t.common.saving : t.settings.wheel.save}
          </motion.button>
        </div>
      </div>
    </div>
  )
}

function SettingsField({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </label>
      {description && (
        <p
          className="text-[12px] -mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-[background,border-color,opacity] duration-150 disabled:cursor-not-allowed"
      style={{
        background: checked
          ? 'color-mix(in oklab, var(--lg-accent) 10%, transparent)'
          : 'var(--lg-surface-2, var(--bg-subtle))',
        border: `1px solid ${checked ? 'color-mix(in oklab, var(--lg-accent) 45%, transparent)' : 'var(--lg-divider, var(--border-subtle))'}`,
        opacity: disabled ? 0.85 : 1,
        fontFamily: 'var(--font-body)',
      }}
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 mt-0.5 rounded-full transition-[background] duration-150"
        style={{
          width: 32,
          height: 18,
          background: checked ? 'var(--accent-color, #0066FF)' : 'rgba(120,120,120,0.25)',
          padding: 2,
        }}
      >
        <span
          className="block rounded-full bg-white transition-transform duration-150"
          style={{
            width: 14,
            height: 14,
            transform: checked ? 'translateX(14px)' : 'translateX(0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          }}
        />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="text-[13px] font-medium"
          style={{ color: 'var(--lg-text-1, var(--text-primary))' }}
        >
          {label}
        </span>
        {hint && (
          <span
            className="text-[12px]"
            style={{ color: 'var(--lg-text-3, var(--text-tertiary))' }}
          >
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}
