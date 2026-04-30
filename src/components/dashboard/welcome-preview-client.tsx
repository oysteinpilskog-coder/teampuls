'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, EyeOff, Eye, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { AuroraBackground } from '@/components/dashboard-views/aurora-background'
import { WelcomeView } from '@/components/dashboard-views/welcome-view'
import type { Visit } from '@/lib/supabase/types'
import { useT } from '@/lib/i18n/context'
import { toDateString, getDayPhase } from '@/lib/dates'

interface WelcomePreviewClientProps {
  orgName: string
  visits: Visit[]
}

/** «14:00» → «14:00:00». Postgres TIME-form, samme som i `visits`-tabellen. */
function toTimeStr(hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null
  return `${hhmm}:00`
}

const DEFAULT_CUSTOM = {
  visitor_name: 'Anna Hansen',
  visitor_company: 'Acme AS',
  start_hhmm: '14:00',
  end_hhmm: '15:30',
}

/**
 * Forhåndsvisning av velkomst-slide. Aurora-backdrop + WelcomeView i
 * full-screen, akkurat som på TV-en, men uten rotasjon eller tidsvindu —
 * brukeren styrer hvilken besøkende som vises via et flytende kontrollpanel.
 *
 * Ved å bruke ekte `WelcomeView` får man designsannhet (samme typografi,
 * Nordlys-strek og animasjoner som live), så et OK her = OK på skjermen.
 */
export function WelcomePreviewClient({ orgName, visits }: WelcomePreviewClientProps) {
  const t = useT()
  const [chooserMode, setChooserMode] = useState<'real' | 'custom'>(
    visits.length > 0 ? 'real' : 'custom',
  )
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(
    visits[0]?.id ?? null,
  )
  const [custom, setCustom] = useState({ ...DEFAULT_CUSTOM })
  const [showControls, setShowControls] = useState(true)

  const previewVisit: Visit = useMemo(() => {
    if (chooserMode === 'real' && selectedVisitId) {
      const real = visits.find(v => v.id === selectedVisitId)
      if (real) return real
    }
    // Syntetisk visit for «egendefinert»-modus. id genereres fra feltene
    // så WelcomeView's AnimatePresence cross-fader når brukeren endrer dem.
    const start = toTimeStr(custom.start_hhmm) ?? '14:00:00'
    const end = toTimeStr(custom.end_hhmm)
    return {
      id: `preview:${custom.visitor_name}:${start}:${end ?? ''}`,
      org_id: '',
      host_member_id: '',
      visitor_name: custom.visitor_name.trim() || 'Forventet gjest',
      visitor_company: custom.visitor_company.trim() || null,
      date: toDateString(new Date()),
      start_time: start,
      end_time: end,
      note: null,
      source: 'manual',
      source_text: null,
      confidence: null,
      created_by: null,
      created_at: '',
      updated_at: '',
    }
  }, [chooserMode, selectedVisitId, visits, custom])

  // Phase ved nåværende tid — så preview-et speiler hvordan det ser ut
  // akkurat nå om kunden hadde kommet inn døra dette sekundet.
  const phase = getDayPhase(new Date())

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ backgroundColor: '#050507', color: 'white' }}
    >
      <AuroraBackground entries={[]} phase={phase} />

      {/* Fullskjerms-canvas — ekte WelcomeView, samme komponent som TV-en. */}
      <div className="absolute inset-0">
        <WelcomeView visits={[previewVisit]} orgName={orgName} />
      </div>

      <AnimatePresence>
        {showControls && (
          <motion.div
            key="controls"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="absolute bottom-6 left-6 z-20 w-[340px] max-w-[92vw]"
          >
            <div
              className="rounded-2xl p-5"
              style={{
                background: 'rgba(20,22,28,0.78)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 30px 60px rgba(0,0,0,0.45)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.75)' }} />
                  <p className="text-[12px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {t.dashboard.preview.title}
                  </p>
                </div>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1 text-[12px] transition-colors"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {t.dashboard.preview.back}
                </Link>
              </div>

              <div
                className="flex gap-1 mb-3 p-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <button
                  type="button"
                  onClick={() => setChooserMode('real')}
                  disabled={visits.length === 0}
                  className="flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: chooserMode === 'real' ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: chooserMode === 'real' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
                  }}
                >
                  {t.dashboard.preview.realVisits}
                </button>
                <button
                  type="button"
                  onClick={() => setChooserMode('custom')}
                  className="flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
                  style={{
                    background: chooserMode === 'custom' ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: chooserMode === 'custom' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
                  }}
                >
                  {t.dashboard.preview.custom}
                </button>
              </div>

              {chooserMode === 'real' ? (
                visits.length === 0 ? (
                  <p
                    className="text-[12px] leading-relaxed py-2"
                    style={{ color: 'rgba(255,255,255,0.55)' }}
                  >
                    {t.dashboard.preview.noVisits}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                    {visits.map(v => {
                      const isActive = v.id === selectedVisitId
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVisitId(v.id)}
                          className="flex flex-col items-start text-left px-3 py-2 rounded-lg transition-colors"
                          style={{
                            background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                            outline: isActive ? '1px solid rgba(255,255,255,0.20)' : 'none',
                          }}
                        >
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: 'rgba(255,255,255,0.95)' }}
                          >
                            {v.visitor_name}
                          </span>
                          <span
                            className="text-[11px] mt-0.5 tabular-nums"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                          >
                            {v.date} · {v.start_time.slice(0, 5)}
                            {v.end_time ? `–${v.end_time.slice(0, 5)}` : ''}
                            {v.visitor_company ? ` · ${v.visitor_company}` : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-2.5">
                  <Field
                    label={t.dashboard.preview.fields.name}
                    value={custom.visitor_name}
                    onChange={v => setCustom(c => ({ ...c, visitor_name: v }))}
                    placeholder="Anna Hansen"
                  />
                  <Field
                    label={t.dashboard.preview.fields.company}
                    value={custom.visitor_company}
                    onChange={v => setCustom(c => ({ ...c, visitor_company: v }))}
                    placeholder="Acme AS"
                  />
                  <div className="flex gap-2">
                    <Field
                      label={t.dashboard.preview.fields.start}
                      value={custom.start_hhmm}
                      onChange={v => setCustom(c => ({ ...c, start_hhmm: v }))}
                      type="time"
                    />
                    <Field
                      label={t.dashboard.preview.fields.end}
                      value={custom.end_hhmm}
                      onChange={v => setCustom(c => ({ ...c, end_hhmm: v }))}
                      type="time"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowControls(false)}
                className="mt-4 w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 transition-colors"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                <EyeOff className="w-3 h-3" />
                {t.dashboard.preview.hideControls}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showControls && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => setShowControls(true)}
          className="absolute bottom-6 left-6 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.18em] transition-colors"
          style={{
            background: 'rgba(20,22,28,0.7)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.65)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <Eye className="w-3 h-3" />
          {t.dashboard.preview.showControls}
        </motion.button>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-0">
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.15em]"
        style={{ color: 'rgba(255,255,255,0.50)' }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 rounded-md text-[13px]"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.95)',
          fontFamily: 'var(--font-body)',
          colorScheme: 'dark',
        }}
      />
    </label>
  )
}
