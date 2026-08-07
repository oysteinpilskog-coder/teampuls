'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Organization, DashboardViewKey } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import {
  DEFAULT_VIEW_DURATIONS,
  DURATION_MIN_SEC,
  DURATION_MAX_SEC,
} from '@/lib/dashboard-defaults'
import { useT } from '@/lib/i18n/context'

// Konfigurerbare visninger i Settings — Velkomst-view F injiseres dynamisk
// på dashboardet og skal aldri lagres til organizations.dashboard_rotation_views.
// H/I er kunder splittet på avdeling (UK vs Nordic).
const DASHBOARD_VIEW_KEYS = ['A', 'B', 'C', 'D', 'H', 'I', 'E', 'G'] as const

function sameSet(a: DashboardViewKey[], b: DashboardViewKey[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  for (const k of b) if (!sa.has(k)) return false
  return true
}

export function DashboardSettingsClient({ org: initialOrg }: { org: Organization }) {
  const t = useT()
  const [org, setOrg] = useState(initialOrg)

  const [rotationViews, setRotationViews] = useState<DashboardViewKey[]>(
    initialOrg.dashboard_rotation_views && initialOrg.dashboard_rotation_views.length > 0
      ? initialOrg.dashboard_rotation_views
      : [...DASHBOARD_VIEW_KEYS]
  )

  const savedViewDurations: Record<DashboardViewKey, number> = (() => {
    const out = { ...DEFAULT_VIEW_DURATIONS }
    const raw = initialOrg.dashboard_view_durations
    if (raw) {
      for (const k of DASHBOARD_VIEW_KEYS) {
        const v = raw[k]
        if (typeof v === 'number' && Number.isFinite(v) && v >= DURATION_MIN_SEC && v <= DURATION_MAX_SEC) {
          out[k] = Math.round(v)
        }
      }
    }
    return out
  })()
  const [viewDurations, setViewDurations] = useState<Record<DashboardViewKey, number>>(savedViewDurations)

  const [saving, setSaving] = useState(false)

  const savedRotationViews: DashboardViewKey[] =
    org.dashboard_rotation_views && org.dashboard_rotation_views.length > 0
      ? org.dashboard_rotation_views
      : [...DASHBOARD_VIEW_KEYS]
  const rotationDirty = !sameSet(rotationViews, savedRotationViews)
  const durationsDirty = DASHBOARD_VIEW_KEYS.some(k => viewDurations[k] !== savedViewDurations[k])
  const isDirty = rotationDirty || durationsDirty

  function toggleRotationView(view: DashboardViewKey) {
    setRotationViews(prev => {
      const has = prev.includes(view)
      if (has) {
        // Never let the admin save an empty rotation — the dashboard needs at
        // least one view to render. We keep the last one locked on.
        if (prev.length === 1) return prev
        return prev.filter(v => v !== view)
      }
      // Preserve canonical order so the saved array matches the rotation sequence.
      const next = [...prev, view]
      return DASHBOARD_VIEW_KEYS.filter(k => next.includes(k))
    })
  }

  async function handleSave() {
    if (!isDirty || saving) return
    setSaving(true)
    const supabase = createClient()
    const rotation_payload =
      rotationViews.length > 0 ? [...rotationViews] : [...DASHBOARD_VIEW_KEYS]
    const { error } = await supabase
      .from('organizations')
      .update({
        dashboard_rotation_views: rotation_payload,
        dashboard_view_durations: { ...viewDurations },
      })
      .eq('id', org.id)
    setSaving(false)
    if (error) {
      console.error('[settings/dashboard] save failed:', error)
      toast.error(`${t.common.error} (${error.code ?? 'ukjent'}: ${error.message})`)
      return
    }
    setOrg(o => ({
      ...o,
      dashboard_rotation_views: rotation_payload,
      dashboard_view_durations: { ...viewDurations },
    }))
    toast.success(t.settings.dashboard.saved)
  }

  const viewLabels = {
    A: t.dashboard.views.now,
    B: t.dashboard.views.week,
    C: t.dashboard.views.offices,
    D: t.dashboard.views.customers,
    E: t.dashboard.views.wheel,
    G: t.dashboard.views.globe,
    H: t.dashboard.views.customersUk,
    I: t.dashboard.views.customersNordic,
    J: t.dashboard.views.figures,
  } as const

  return (
    <div>
      <div className="mb-6">
        <h1
          className="calwin-bar text-[24px] font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
        >
          {t.settings.dashboard.title}
        </h1>
        <p
          className="text-[14px] mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.settings.dashboard.subtitle}
        </p>
      </div>

      <div
        className="rounded-2xl p-6 flex flex-col gap-5"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <SettingsField
          label={t.settings.dashboard.rotation}
          description={t.settings.dashboard.rotationDesc}
        >
          <DashboardRotationPicker
            selected={rotationViews}
            onToggle={toggleRotationView}
            labels={viewLabels}
            minHint={t.settings.dashboard.rotationMinOne}
          />
        </SettingsField>

        <SettingsField
          label={t.settings.dashboard.durations}
          description={t.settings.dashboard.durationsDesc}
        >
          <DashboardDurationsEditor
            durations={viewDurations}
            onChange={(view, value) =>
              setViewDurations(prev => ({ ...prev, [view]: value }))
            }
            labels={viewLabels}
            secondsSuffix={t.settings.dashboard.durationsSecondsSuffix}
            onReset={() => setViewDurations({ ...DEFAULT_VIEW_DURATIONS })}
            resetLabel={t.settings.dashboard.durationsResetDefault}
          />
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
            {saving ? t.common.saving : t.settings.dashboard.save}
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

function DashboardRotationPicker({
  selected,
  onToggle,
  labels,
  minHint,
}: {
  selected: DashboardViewKey[]
  onToggle: (v: DashboardViewKey) => void
  labels: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'G' | 'H' | 'I', string>
  minHint: string
}) {
  const isLastOne = selected.length === 1
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {DASHBOARD_VIEW_KEYS.map((key) => {
          const active = selected.includes(key)
          const locked = active && isLastOne
          return (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={active}
              aria-label={labels[key]}
              disabled={locked}
              onClick={() => onToggle(key)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-[background,border-color,opacity] duration-150 disabled:cursor-not-allowed"
              style={{
                background: active ? 'color-mix(in oklab, var(--lg-accent) 12%, transparent)' : 'var(--lg-surface-2, var(--bg-subtle))',
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
              {labels[key]}
            </button>
          )
        })}
      </div>
      <p
        className="text-[11.5px]"
        style={{ color: 'var(--lg-text-3, var(--text-tertiary))', fontFamily: 'var(--font-body)' }}
      >
        {minHint}
      </p>
    </div>
  )
}

function DashboardDurationsEditor({
  durations,
  onChange,
  labels,
  secondsSuffix,
  onReset,
  resetLabel,
}: {
  durations: Record<DashboardViewKey, number>
  onChange: (view: DashboardViewKey, value: number) => void
  labels: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'G' | 'H' | 'I', string>
  secondsSuffix: string
  onReset: () => void
  resetLabel: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        {DASHBOARD_VIEW_KEYS.map(key => {
          const value = durations[key]
          const isDefault = value === DEFAULT_VIEW_DURATIONS[key]
          return (
            <div
              key={key}
              className="flex items-center gap-3 px-3.5 py-2 rounded-xl"
              style={{
                background: 'var(--lg-surface-2, var(--bg-subtle))',
                border: '1px solid var(--lg-divider, var(--border-subtle))',
                fontFamily: 'var(--font-body)',
              }}
            >
              <span
                className="flex-1 text-[13px] font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {labels[key]}
              </span>
              <input
                type="number"
                min={DURATION_MIN_SEC}
                max={DURATION_MAX_SEC}
                step={1}
                value={value}
                onChange={e => {
                  const n = Math.round(Number(e.target.value))
                  if (Number.isFinite(n)) {
                    const clamped = Math.max(DURATION_MIN_SEC, Math.min(DURATION_MAX_SEC, n))
                    onChange(key, clamped)
                  }
                }}
                aria-label={labels[key]}
                className="w-16 px-2 py-1 rounded-md text-[13px] tabular-nums text-right outline-none"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: `1.5px solid ${isDefault ? 'transparent' : 'color-mix(in oklab, var(--lg-accent) 45%, transparent)'}`,
                  fontFamily: 'var(--font-body)',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                onBlur={e =>
                  (e.currentTarget.style.borderColor = isDefault
                    ? 'transparent'
                    : 'color-mix(in oklab, var(--lg-accent) 45%, transparent)')
                }
              />
              <span
                className="text-[12px] uppercase tracking-[0.14em] tabular-nums"
                style={{ color: 'var(--text-tertiary)', minWidth: 28 }}
              >
                {secondsSuffix}
              </span>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium self-start transition-colors mt-1"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-color)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      >
        <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
        {resetLabel}
      </button>
    </div>
  )
}
