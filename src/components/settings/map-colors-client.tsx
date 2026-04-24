'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { MapPin as MapPinIcon, RotateCcw, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Organization } from '@/lib/supabase/types'
import { DEFAULT_HEX_COLORS, mergeHexColors, type HexColors } from '@/lib/status-colors/defaults'
import { useStatusColorsController } from '@/lib/status-colors/context'
import { MapPin } from '@/components/dashboard-views/map-pin'
import { complement } from '@/lib/color'
import { spring } from '@/lib/motion'

interface MapColorsClientProps {
  org: Organization
}

/**
 * Dedicated settings surface for the two colours that drive the dashboard
 * map pins. Writes back into the existing `organizations.status_colors`
 * JSONB so the map and the rest of the app stay in sync — the office and
 * customer hues are already used by the matrix, the wheel, and every
 * other status surface.
 *
 * The aurora companion isn't stored — `MapPin` auto-derives it as the
 * 180° complement of the primary hue. Keeps this page to a single choice
 * per map so the user can't produce a muddy pairing.
 */
export function MapColorsClient({ org: initialOrg }: MapColorsClientProps) {
  const [org, setOrg] = useState(initialOrg)
  const saved = mergeHexColors(initialOrg.status_colors)
  const [officeColor, setOfficeColor]     = useState(saved.office)
  const [customerColor, setCustomerColor] = useState(saved.customer)
  const [saving, setSaving] = useState(false)
  const ctx = useStatusColorsController()

  const dirty =
    officeColor   !== mergeHexColors(org.status_colors).office ||
    customerColor !== mergeHexColors(org.status_colors).customer

  async function handleSave() {
    if (!dirty || saving) return
    setSaving(true)
    const supabase = createClient()

    const merged: HexColors = {
      ...mergeHexColors(org.status_colors),
      office:   officeColor,
      customer: customerColor,
    }
    const allDefault = (Object.keys(DEFAULT_HEX_COLORS) as Array<keyof HexColors>)
      .every(k => merged[k] === DEFAULT_HEX_COLORS[k])
    const payload = allDefault ? null : merged

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
    if (ctx) ctx.setHex(merged)
    toast.success('Pin-farger lagret')
  }

  function reset() {
    setOfficeColor(DEFAULT_HEX_COLORS.office)
    setCustomerColor(DEFAULT_HEX_COLORS.customer)
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
            Pin-farger for kontor og kunder. Nordlys-gløden deriveres automatisk som komplementfargen.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PinColorCard
          title="Kontor"
          description="Pin-farge for kontorene på kartet"
          color={officeColor}
          onChange={setOfficeColor}
        />
        <PinColorCard
          title="Kunder"
          description="Pin-farge for kundebesøk"
          color={customerColor}
          onChange={setCustomerColor}
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
}: {
  title: string
  description: string
  color: string
  onChange: (hex: string) => void
}) {
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

      {/* Live pin preview — same component the dashboard uses */}
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
          <MapPin radius={11} color={color} index={0} />
        </svg>
      </div>

      {/* Colour inputs */}
      <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[10.5px] font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Nordlys
          </span>
          <span
            className="w-4 h-4 rounded-full"
            style={{
              backgroundColor: complement(color),
              boxShadow: `0 0 10px ${complement(color)}80`,
            }}
            title={complement(color)}
          />
        </div>
      </div>
    </div>
  )
}
