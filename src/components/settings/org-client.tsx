'use client'

import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Copy, Check, Upload, Trash2, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Organization, EntryStatus, PresenceAssumption } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { DEFAULT_HEX_COLORS, mergeHexColors, type HexColors } from '@/lib/status-colors/defaults'
import { derivePalette } from '@/lib/status-colors/derive'
import { useStatusColorsController } from '@/lib/status-colors/context'
import { StatusIcon } from '@/components/icons/status-icons'
import { useT } from '@/lib/i18n/context'

const STATUS_ORDER: EntryStatus[] = ['office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off']

interface OrgClientProps {
  org: Organization
}

const TIMEZONES = [
  'Europe/Oslo',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Vilnius',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'UTC',
]

export function OrgClient({ org: initialOrg }: OrgClientProps) {
  const t = useT()
  const [org, setOrg] = useState(initialOrg)
  const [name, setName] = useState(initialOrg.name)
  const [timezone, setTimezone] = useState(initialOrg.timezone)
  const [logoUrl, setLogoUrl] = useState(initialOrg.logo_url ?? '')
  const [primaryColor, setPrimaryColor] = useState(initialOrg.primary_color ?? '#0066FF')
  const [presenceAssumption, setPresenceAssumption] = useState<PresenceAssumption>(
    initialOrg.default_presence_assumption ?? 'none'
  )
  const [statusColors, setStatusColors] = useState<HexColors>(() =>
    mergeHexColors(initialOrg.status_colors)
  )
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusColorsCtx = useStatusColorsController()

  const savedStatusColors = mergeHexColors(org.status_colors)
  const statusColorsDirty = STATUS_ORDER.some(s => statusColors[s] !== savedStatusColors[s])

  const isDirty =
    name !== org.name ||
    timezone !== org.timezone ||
    primaryColor !== (org.primary_color ?? '#0066FF') ||
    presenceAssumption !== (org.default_presence_assumption ?? 'none') ||
    statusColorsDirty

  async function handleLogoFile(file: File) {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Filtype støttes ikke. Bruk PNG, JPEG, SVG eller WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Fil er for stor (maks 5 MB).')
      return
    }
    setUploadingLogo(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${org.id}/logo-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })

    if (uploadError) {
      setUploadingLogo(false)
      toast.error('Kunne ikke laste opp logo.')
      return
    }

    const { data: pub } = supabase.storage.from('logos').getPublicUrl(path)
    const newUrl = pub.publicUrl

    const { error: updateError } = await supabase
      .from('organizations')
      .update({ logo_url: newUrl })
      .eq('id', org.id)

    if (updateError) {
      setUploadingLogo(false)
      toast.error('Opplastet, men kunne ikke lagre URL.')
      return
    }

    // Remove previous logo from storage if it was one of ours
    const prev = org.logo_url
    if (prev && prev.includes('/logos/')) {
      const prevPath = prev.split('/logos/')[1]?.split('?')[0]
      if (prevPath) {
        await supabase.storage.from('logos').remove([prevPath])
      }
    }

    setLogoUrl(newUrl)
    setOrg(o => ({ ...o, logo_url: newUrl }))
    setUploadingLogo(false)
    toast.success('Logo oppdatert')
  }

  async function handleRemoveLogo() {
    if (!logoUrl) return
    setUploadingLogo(true)
    const supabase = createClient()

    const { error: updateError } = await supabase
      .from('organizations')
      .update({ logo_url: null })
      .eq('id', org.id)

    if (updateError) {
      setUploadingLogo(false)
      toast.error('Kunne ikke fjerne logo.')
      return
    }

    if (logoUrl.includes('/logos/')) {
      const prevPath = logoUrl.split('/logos/')[1]?.split('?')[0]
      if (prevPath) await supabase.storage.from('logos').remove([prevPath])
    }

    setLogoUrl('')
    setOrg(o => ({ ...o, logo_url: null }))
    setUploadingLogo(false)
    toast.success('Logo fjernet')
  }

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    const supabase = createClient()
    // If the colors match defaults, store NULL (cleaner DB state, cheaper queries).
    const status_colors_payload = STATUS_ORDER.every(s => statusColors[s] === DEFAULT_HEX_COLORS[s])
      ? null
      : statusColors
    const { error } = await supabase
      .from('organizations')
      .update({
        name: name.trim(),
        timezone,
        primary_color: primaryColor,
        status_colors: status_colors_payload,
        default_presence_assumption: presenceAssumption,
      })
      .eq('id', org.id)
    setSaving(false)
    if (error) { toast.error(t.common.error); return }
    setOrg(o => ({
      ...o,
      name: name.trim(),
      timezone,
      primary_color: primaryColor,
      status_colors: status_colors_payload,
      default_presence_assumption: presenceAssumption,
    }))
    // Push fresh colors through the context so the rest of the app updates immediately.
    statusColorsCtx?.setHex(statusColors)
    toast.success('Innstillinger lagret')
  }

  function resetStatusColors() {
    setStatusColors({ ...DEFAULT_HEX_COLORS })
  }

  function updateStatusColor(status: EntryStatus, hex: string) {
    setStatusColors(prev => ({ ...prev, [status]: hex }))
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(org.inbound_email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-[24px] font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
        >
          Organisasjon
        </h1>
        <p className="text-[14px] mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
          Firmainstillinger og branding
        </p>
      </div>

      <div
        className="rounded-2xl p-6 flex flex-col gap-5"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Name */}
        <SettingsField label="Firmanavn">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Firmanavn AS"
            className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
            style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
          />
        </SettingsField>

        {/* Inbound email */}
        <SettingsField
          label="Inbound e-post"
          description="Send en e-post hit for å oppdatere teamstatus automatisk"
        >
          <div className="flex items-center gap-2">
            <div
              className="flex-1 px-3 py-2.5 rounded-xl text-[14px] font-mono select-all"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                border: '1.5px solid transparent',
                fontFamily: 'monospace',
              }}
            >
              {org.inbound_email}
            </div>
            <button
              onClick={copyEmail}
              className="p-2.5 rounded-xl transition-colors"
              style={{
                backgroundColor: copied ? 'rgba(22,163,98,0.1)' : 'var(--bg-subtle)',
                color: copied ? '#16A362' : 'var(--text-tertiary)',
              }}
              aria-label="Kopier e-postadresse"
            >
              {copied
                ? <Check className="w-4 h-4" strokeWidth={2} />
                : <Copy className="w-4 h-4" strokeWidth={1.5} />
              }
            </button>
          </div>
        </SettingsField>

        {/* Timezone */}
        <SettingsField label="Tidssone">
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none appearance-none cursor-pointer"
            style={{
              ...inputStyle,
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23A8A29E\' stroke-width=\'1.5\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
            ))}
          </select>
        </SettingsField>

        {/* Logo */}
        <SettingsField label="Logo" description="SVG, PNG, JPEG eller WebP — maks 5 MB">
          <div className="flex items-center gap-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                border: '1.5px dashed var(--border-subtle)',
              }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                >
                  Ingen
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleLogoFile(f)
                  e.target.value = ''
                }}
              />
              <motion.button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <Upload className="w-4 h-4" strokeWidth={1.5} />
                {uploadingLogo ? 'Laster opp...' : logoUrl ? 'Bytt logo' : 'Last opp logo'}
              </motion.button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={uploadingLogo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium self-start transition-colors disabled:opacity-40"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Fjern
                </button>
              )}
            </div>
          </div>
        </SettingsField>

        {/* Primary color */}
        <SettingsField label="Primærfarge" description="Aksentfarge for organisasjonen">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={e => setPrimaryColor(e.target.value)}
              className="w-12 h-10 rounded-lg cursor-pointer border-0 p-0.5"
              style={{ backgroundColor: 'var(--bg-subtle)' }}
            />
            <input
              type="text"
              value={primaryColor}
              onChange={e => setPrimaryColor(e.target.value)}
              maxLength={7}
              className="w-32 px-3 py-2.5 rounded-xl text-[14px] outline-none font-mono"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
            />
          </div>
        </SettingsField>

        {/* Presence assumption */}
        <SettingsField
          label="Tomme dager"
          description="Hva skal vises når et medlem ikke har lagt inn status? Antatte dager vises alltid med dempet stil og stiplet kant, så de er lett å skille fra registrerte."
        >
          <PresenceAssumptionPicker value={presenceAssumption} onChange={setPresenceAssumption} />
        </SettingsField>

        {/* Status colors */}
        <SettingsField
          label="Statusfarger"
          description="Tilpass fargene for hver statustype — gradient og glød følger med automatisk"
        >
          <div className="flex flex-col gap-2.5">
            {STATUS_ORDER.map(status => (
              <StatusColorRow
                key={status}
                status={status}
                hex={statusColors[status]}
                onChange={hex => updateStatusColor(status, hex)}
              />
            ))}
            <button
              type="button"
              onClick={resetStatusColors}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium self-start transition-colors mt-1"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-color)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
              Tilbakestill til standard
            </button>
          </div>
        </SettingsField>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <motion.button
            onClick={handleSave}
            disabled={!isDirty || saving}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
            className="px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
          >
            {saving ? 'Lagrer...' : 'Lagre endringer'}
          </motion.button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-subtle)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  border: '1.5px solid transparent',
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
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </label>
      {description && (
        <p className="text-[12px] -mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
          {description}
        </p>
      )}
      {children}
    </div>
  )
}

const PRESENCE_OPTIONS: Array<{
  value: PresenceAssumption
  label: string
  hint: string
}> = [
  {
    value: 'none',
    label: 'Ingen antagelse',
    hint: 'La tomme celler være tomme. Mest ærlig — anbefalt.',
  },
  {
    value: 'office',
    label: 'Antatt kontor',
    hint: 'Vis alle uten registrering som "på kontoret".',
  },
  {
    value: 'remote',
    label: 'Antatt hjemmekontor',
    hint: 'Vis alle uten registrering som "hjemmekontor".',
  },
  {
    value: 'per_member',
    label: 'Per medlem',
    hint: 'Bruk hvert medlems egen standardstatus (fallback: kontor).',
  },
]

function PresenceAssumptionPicker({
  value,
  onChange,
}: {
  value: PresenceAssumption
  onChange: (v: PresenceAssumption) => void
}) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Antatt standard">
      {PRESENCE_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-[background,border-color] duration-150"
            style={{
              background: active ? 'rgba(139, 92, 246, 0.10)' : 'var(--lg-surface-2, var(--bg-subtle))',
              border: `1px solid ${active ? 'rgba(139, 92, 246, 0.45)' : 'var(--lg-divider, var(--border-subtle))'}`,
              fontFamily: 'var(--font-body)',
            }}
          >
            <span
              aria-hidden
              className="mt-1 inline-flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 14,
                height: 14,
                background: active ? 'var(--lg-accent)' : 'transparent',
                boxShadow: active
                  ? '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 10px var(--lg-accent-glow)'
                  : `inset 0 0 0 1.5px var(--lg-divider, var(--border-subtle))`,
              }}
            >
              {active && (
                <span
                  className="rounded-full"
                  style={{ width: 5, height: 5, background: '#ffffff' }}
                />
              )}
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span
                className="text-[13px] font-medium"
                style={{ color: 'var(--lg-text-1, var(--text-primary))' }}
              >
                {opt.label}
              </span>
              <span
                className="text-[12px]"
                style={{ color: 'var(--lg-text-3, var(--text-tertiary))' }}
              >
                {opt.hint}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StatusColorRow({
  status,
  hex,
  onChange,
}: {
  status: EntryStatus
  hex: string
  onChange: (hex: string) => void
}) {
  const palette = derivePalette(hex)
  const [g0, g1] = palette.gradient.light
  const gradient = `linear-gradient(180deg, ${g0} 0%, ${g1} 100%)`
  const t = useT()
  const label = t.status[status]

  return (
    <div className="flex items-center gap-3">
      {/* Name label */}
      <div
        className="w-[108px] text-[13px] font-medium"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </div>

      {/* Native swatch */}
      <input
        type="color"
        value={hex}
        onChange={e => onChange(e.target.value.toUpperCase())}
        className="w-10 h-9 rounded-lg cursor-pointer border-0 p-0.5 shrink-0"
        style={{ backgroundColor: 'var(--bg-subtle)' }}
        aria-label={`Farge for ${label}`}
      />

      {/* Hex input */}
      <input
        type="text"
        value={hex}
        onChange={e => {
          const v = e.target.value.trim()
          if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
            onChange(v.startsWith('#') ? v.toUpperCase() : `#${v.toUpperCase()}`)
          }
        }}
        maxLength={7}
        className="w-[92px] px-2.5 py-2 rounded-lg text-[12.5px] outline-none font-mono shrink-0"
        style={inputStyle}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
      />

      {/* Live preview bar — same gradient + glow as the calendar matrix */}
      <div
        className="relative flex-1 h-[36px] rounded-[9px] overflow-hidden"
        style={{
          backgroundImage: gradient,
          backgroundColor: g1,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.40), 0 1px 2px rgba(15,23,42,0.08), 0 8px 20px -8px ${palette.glow}80`,
        }}
      >
        {/* Subtle top sheen */}
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{
            height: '45%',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 70%, transparent 100%)',
          }}
        />
        {/* Specular edge */}
        <div
          aria-hidden
          className="absolute top-0 left-[8%] right-[8%] pointer-events-none"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
          }}
        />
        {/* Icon + label */}
        <div className="absolute inset-0 flex items-center gap-1.5 px-2.5">
          <StatusIcon status={status} size={12} color="#ffffff" />
          <span
            className="text-[11.5px] font-semibold leading-none"
            style={{
              color: '#ffffff',
              letterSpacing: '-0.005em',
              textShadow: '0 1px 2px rgba(0,0,0,0.22)',
            }}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}
