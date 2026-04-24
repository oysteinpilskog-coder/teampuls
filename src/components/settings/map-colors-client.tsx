'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { MapPin as MapPinIcon, RotateCcw, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Organization } from '@/lib/supabase/types'
import {
  DEFAULT_HEX_COLORS,
  mergeHexColors,
  extractAuroraColors,
  type HexColors,
  type AuroraColors,
} from '@/lib/status-colors/defaults'
import { useStatusColorsController } from '@/lib/status-colors/context'
import { MapPin } from '@/components/dashboard-views/map-pin'
import { complement } from '@/lib/color'
import { spring } from '@/lib/motion'

interface MapColorsClientProps {
  org: Organization
}

/**
 * Dedicated settings surface for the colours that drive the dashboard
 * map pins. Writes back into the existing `organizations.status_colors`
 * JSONB so the map and the rest of the app stay in sync — the office and
 * customer hues are already used by the matrix, the wheel, and every
 * other status surface.
 *
 * The aurora companion ("Nordlys") auto-derives as the 180° complement
 * of the primary hue, but can be overridden explicitly per pin — the
 * override is persisted alongside the status colours under
 * `office_aurora` / `customer_aurora` keys in the same JSONB.
 */
export function MapColorsClient({ org: initialOrg }: MapColorsClientProps) {
  const [org, setOrg] = useState(initialOrg)
  const saved = mergeHexColors(initialOrg.status_colors)
  const savedAuroras = extractAuroraColors(initialOrg.status_colors)
  const [officeColor, setOfficeColor]       = useState(saved.office)
  const [customerColor, setCustomerColor]   = useState(saved.customer)
  const [officeAurora, setOfficeAurora]     = useState<string | undefined>(savedAuroras.office)
  const [customerAurora, setCustomerAurora] = useState<string | undefined>(savedAuroras.customer)
  const [saving, setSaving] = useState(false)
  const ctx = useStatusColorsController()

  const currentAuroras = extractAuroraColors(org.status_colors)
  const dirty =
    officeColor    !== mergeHexColors(org.status_colors).office   ||
    customerColor  !== mergeHexColors(org.status_colors).customer ||
    officeAurora   !== currentAuroras.office                      ||
    customerAurora !== currentAuroras.customer

  async function handleSave() {
    if (!dirty || saving) return
    setSaving(true)
    const supabase = createClient()

    // Build the status-hex map from scratch (no spread from old JSONB)
    // so stale aurora keys never leak back into the payload when the
    // user has just cleared an override.
    const baseHex = mergeHexColors(org.status_colors)
    const merged: HexColors = {
      ...baseHex,
      office:   officeColor,
      customer: customerColor,
    }
    const statusOnly = (Object.keys(DEFAULT_HEX_COLORS) as Array<keyof HexColors>)
      .reduce<Partial<HexColors>>((acc, k) => {
        acc[k] = merged[k]
        return acc
      }, {})

    const allStatusDefault = (Object.keys(DEFAULT_HEX_COLORS) as Array<keyof HexColors>)
      .every(k => merged[k] === DEFAULT_HEX_COLORS[k])
    const nothingStored =
      allStatusDefault && officeAurora === undefined && customerAurora === undefined

    const payload = nothingStored
      ? null
      : {
          ...statusOnly,
          ...(officeAurora   !== undefined ? { office_aurora:   officeAurora }   : {}),
          ...(customerAurora !== undefined ? { customer_aurora: customerAurora } : {}),
        }

    const { error } = await supabase
      .from('organizations')
      .update({ status_colors: payload })
      .eq('id', org.id)

    setSaving(false)
    if (error) {
      toast.error('Kunne ikke lagre — prøv igjen')
      return
    }

    setOrg(prev => ({ ...prev, status_colors: payload }))
    if (ctx) {
      ctx.setHex(merged)
      const nextAuroras: AuroraColors = {}
      if (officeAurora   !== undefined) nextAuroras.office   = officeAurora
      if (customerAurora !== undefined) nextAuroras.customer = customerAurora
      ctx.setAuroras(nextAuroras)
    }
    toast.success('Pin-farger lagret')
  }

  function reset() {
    setOfficeColor(DEFAULT_HEX_COLORS.office)
    setCustomerColor(DEFAULT_HEX_COLORS.customer)
    setOfficeAurora(undefined)
    setCustomerAurora(undefined)
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-[24px] font-semibold flex items-center gap-2"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
          >
            <MapPinIcon className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--accent-color)' }} />
            Kart
          </h1>
          <p
            className="text-[14px] mt-0.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Pin-farger for kontor og kunder. Nordlys-gløden deriveres automatisk som komplementfargen — eller overstyr den selv per pin.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PinColorCard
          title="Kontor"
          description="Pin-farge for kontorene på kartet"
          color={officeColor}
          onChange={setOfficeColor}
          auroraOverride={officeAurora}
          onAuroraChange={setOfficeAurora}
        />
        <PinColorCard
          title="Kunder"
          description="Pin-farge for kundebesøk"
          color={customerColor}
          onChange={setCustomerColor}
          auroraOverride={customerAurora}
          onAuroraChange={setCustomerAurora}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors"
          style={{
            color: 'var(--text-tertiary)',
            backgroundColor: 'var(--bg-subtle)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
          Tilbakestill
        </button>

        <motion.button
          onClick={handleSave}
          disabled={!dirty || saving}
          whileHover={dirty && !saving ? { scale: 1.02 } : undefined}
          whileTap={dirty && !saving ? { scale: 0.97 } : undefined}
          transition={spring.snappy}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
        >
          <Save className="w-3.5 h-3.5" strokeWidth={2} />
          {saving ? 'Lagrer…' : 'Lagre'}
        </motion.button>
      </div>
    </div>
  )
}

function PinColorCard({
  title,
  description,
  color,
  onChange,
  auroraOverride,
  onAuroraChange,
}: {
  title: string
  description: string
  color: string
  onChange: (hex: string) => void
  /** Explicit Nordlys override. `undefined` means "auto-derive from pin". */
  auroraOverride: string | undefined
  onAuroraChange: (hex: string | undefined) => void
}) {
  const autoAurora = complement(color)
  const effectiveAurora = auroraOverride ?? autoAurora
  const auroraCustom = auroraOverride !== undefined

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            className="text-[15px] font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
          >
            {title}
          </h3>
          <p
            className="text-[12.5px] mt-0.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {description}
          </p>
        </div>
      </div>

      {/* Live pin preview — same component the dashboard uses. Feeds the
       *  Nordlys override through so the user sees their choice live. */}
      <div
        className="relative rounded-xl overflow-hidden h-40 flex items-center justify-center"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, rgba(20,24,40,0.9) 0%, rgba(5,5,10,1) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <svg
          viewBox="-90 -90 180 180"
          width="100%"
          height="100%"
          style={{ display: 'block', maxWidth: 240 }}
          aria-hidden
        >
          <MapPin radius={11} color={color} auroraCompanion={effectiveAurora} index={0} />
        </svg>
      </div>

      {/* Primary pin colour */}
      <div className="flex items-center gap-3">
        <span
          className="w-[68px] text-[11px] font-semibold uppercase tracking-widest shrink-0"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          Pin
        </span>
        <input
          type="color"
          value={color}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className="w-10 h-9 rounded-lg cursor-pointer border-0 p-0.5 shrink-0"
          style={{ backgroundColor: 'var(--bg-subtle)' }}
          aria-label={`${title} pin-farge`}
        />
        <input
          type="text"
          value={color}
          onChange={e => {
            const v = e.target.value.trim()
            if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
              onChange(v.startsWith('#') ? v.toUpperCase() : `#${v.toUpperCase()}`)
            }
          }}
          maxLength={7}
          className="flex-1 px-2.5 py-2 rounded-lg text-[13px] outline-none font-mono"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            color: 'var(--text-primary)',
            border: '1.5px solid transparent',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
        />
      </div>

      {/* Aurora (Nordlys) colour — user-overridable, auto-derived otherwise */}
      <div className="flex items-center gap-3">
        <span
          className="w-[68px] text-[11px] font-semibold uppercase tracking-widest shrink-0"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          Nordlys
        </span>
        <input
          type="color"
          value={effectiveAurora}
          onChange={e => onAuroraChange(e.target.value.toUpperCase())}
          className="w-10 h-9 rounded-lg cursor-pointer border-0 p-0.5 shrink-0"
          style={{ backgroundColor: 'var(--bg-subtle)' }}
          aria-label={`${title} Nordlys-farge`}
        />
        <input
          type="text"
          value={effectiveAurora}
          onChange={e => {
            const v = e.target.value.trim()
            if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
              onAuroraChange(v.startsWith('#') ? v.toUpperCase() : `#${v.toUpperCase()}`)
            }
          }}
          maxLength={7}
          className="flex-1 px-2.5 py-2 rounded-lg text-[13px] outline-none font-mono"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            color: 'var(--text-primary)',
            border: '1.5px solid transparent',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
        />
        <button
          type="button"
          onClick={() => onAuroraChange(undefined)}
          disabled={!auroraCustom}
          className="px-2.5 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-widest transition-colors disabled:opacity-40 shrink-0"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            color: auroraCustom ? 'var(--accent-color)' : 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
          }}
          title={auroraCustom ? 'Bruk auto-derivert komplementfarge' : 'Auto-derivert fra pin-farge'}
        >
          Auto
        </button>
      </div>
    </div>
  )
}
