'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, MapPin, Sparkles, Check, Loader2, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { geocode } from '@/lib/geocode-client'
import type { Office } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { CountryCombobox } from '@/components/ui/country-combobox'
import { EmptyState } from '@/components/empty-state'

// Leaflet leser `window` ved import — må lastes klient-side etter mount.
const CoordsMapPicker = dynamic(
  () => import('@/components/ui/coords-map-picker').then(m => m.CoordsMapPicker),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-xl"
        style={{
          height: 260,
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border-subtle)',
        }}
      />
    ),
  },
)

interface OfficesClientProps {
  orgId: string
  initialOffices: Office[]
}

interface OfficeFormState {
  name: string
  city: string
  postal_code: string
  country_code: string
  address: string
  timezone: string
  latitude: string
  longitude: string
}

const EMPTY_FORM: OfficeFormState = {
  name: '',
  city: '',
  postal_code: '',
  country_code: '',
  address: '',
  timezone: '',
  latitude: '',
  longitude: '',
}

type GeocodeStatus =
  | { state: 'idle' }
  | { state: 'working' }
  | { state: 'done'; display: string }
  | { state: 'error'; message: string }

export function OfficesClient({ orgId, initialOffices }: OfficesClientProps) {
  const [offices, setOffices] = useState<Office[]>(initialOffices)
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed')
  const [editTarget, setEditTarget] = useState<Office | null>(null)
  const [form, setForm] = useState<OfficeFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [geo, setGeo] = useState<GeocodeStatus>({ state: 'idle' })
  const t = useT()

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditTarget(null)
    setGeo({ state: 'idle' })
    setModalMode('add')
  }

  function openEdit(o: Office) {
    setForm({
      name: o.name,
      city: o.city ?? '',
      postal_code: o.postal_code ?? '',
      country_code: o.country_code ?? '',
      address: o.address ?? '',
      timezone: o.timezone ?? '',
      latitude: o.latitude?.toString() ?? '',
      longitude: o.longitude?.toString() ?? '',
    })
    setEditTarget(o)
    setGeo(o.latitude != null && o.longitude != null
      ? { state: 'done', display: [o.address, o.postal_code, o.city].filter(Boolean).join(', ') }
      : { state: 'idle' })
    setModalMode('edit')
  }

  function closeModal() { setModalMode('closed') }

  // Track which fields have changed so we know whether to re-geocode on save.
  function updateForm<K extends keyof OfficeFormState>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    // If the user changed an address component, invalidate the geocode status.
    if (['address', 'postal_code', 'city', 'country_code'].includes(key)) {
      setGeo(s => s.state === 'done' ? { state: 'idle' } : s)
    }
    // If user types coords manually, clear idle/done state.
    if ((key === 'latitude' || key === 'longitude') && value.trim()) {
      setGeo({ state: 'idle' })
    }
  }

  async function runGeocode(): Promise<{ lat: number; lng: number } | null> {
    const hasInput = [form.address, form.postal_code, form.city].some(v => v.trim())
    if (!hasInput) {
      setGeo({ state: 'error', message: 'Fyll inn by, postnummer eller adresse først' })
      toast.error(t.settings.offices.errorNeedAddress)
      return null
    }
    // Requiring a country eliminates the "wrong Newcastle" problem — there
    // are 15+ cities named "Newcastle" globally; without a country filter
    // the geocoder will happily pick the one in New South Wales.
    if (!form.country_code) {
      setGeo({ state: 'error', message: 'Velg land før du søker' })
      toast.error(t.settings.offices.errorNeedCountry)
      return null
    }

    setGeo({ state: 'working' })
    try {
      const hit = await geocode({
        address: form.address || null,
        postalCode: form.postal_code || null,
        city: form.city || null,
        countryCode: form.country_code,
      })
      if (!hit) {
        setGeo({ state: 'error', message: 'Fant ikke denne adressen' })
        toast.error(t.settings.offices.errorNotFound)
        return null
      }
      // Defensive check: the geocoder should respect countrycodes, but if
      // the filter got ignored upstream we'd rather fail loudly than place
      // the marker on another continent.
      if (hit.countryCode && hit.countryCode !== form.country_code) {
        setGeo({
          state: 'error',
          message: `Fant kun treff i ${hit.countryCode} — sjekk at by og land stemmer`,
        })
        toast.error(t.settings.offices.errorWrongCountry)
        return null
      }
      setForm(f => ({
        ...f,
        latitude: hit.lat.toFixed(6),
        longitude: hit.lng.toFixed(6),
        // Fill in blanks that the user didn't provide but the geocoder confirmed.
        city: f.city || hit.city || f.city,
        postal_code: f.postal_code || hit.postalCode || f.postal_code,
      }))
      setGeo({ state: 'done', display: hit.displayName })
      return { lat: hit.lat, lng: hit.lng }
    } catch {
      setGeo({ state: 'error', message: 'Noe gikk galt' })
      toast.error(t.settings.offices.errorGeocode)
      return null
    }
  }

  async function handleSave() {
    if (!form.name.trim() || saving) return
    // Require country when anything address-like is set. Without it the
    // geocoder can place the marker on another continent.
    const hasAddressInput = [form.address, form.postal_code, form.city].some(v => v.trim())
    const hasManualCoords = form.latitude.trim() !== '' && form.longitude.trim() !== ''
    if (hasAddressInput && !hasManualCoords && !form.country_code) {
      toast.error(t.settings.offices.errorNeedCountrySave)
      return
    }
    setSaving(true)
    const supabase = createClient()

    // Auto-geocode if the user provided an address/city but no coords.
    let lat = form.latitude ? parseFloat(form.latitude) : null
    let lng = form.longitude ? parseFloat(form.longitude) : null
    if ((lat == null || lng == null) && hasAddressInput) {
      const hit = await runGeocode()
      if (hit) { lat = hit.lat; lng = hit.lng }
      else { setSaving(false); return }
    }

    const row = {
      org_id: orgId,
      name: form.name.trim(),
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      country_code: form.country_code || null,
      address: form.address.trim() || null,
      timezone: form.timezone || null,
      latitude: lat,
      longitude: lng,
    }

    if (modalMode === 'edit' && editTarget) {
      const { error } = await supabase.from('offices').update(row).eq('id', editTarget.id)
      setSaving(false)
      if (error) { toast.error(t.common.errorShort); return }
      setOffices(prev => prev.map(o => o.id === editTarget.id ? { ...o, ...row } : o))
      toast.success(t.settings.offices.toastUpdated)
    } else {
      const { data, error } = await supabase.from('offices').insert(row).select().single()
      setSaving(false)
      if (error) { toast.error(t.common.errorShort); return }
      setOffices(prev => [...prev, data])
      toast.success(`${row.name} ${t.settings.offices.toastAddedSuffix}`)
    }
    closeModal()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const supabase = createClient()
    const { error } = await supabase.from('offices').delete().eq('id', id)
    setDeleting(null)
    if (error) { toast.error(t.common.errorShort); return }
    setOffices(prev => prev.filter(o => o.id !== id))
    toast.success(t.settings.offices.toastDeleted)
  }

  // Maks ett HQ per org. Vi nullstiller andre lokalt og remote først,
  // så markerer det valgte. Partial unique index i DB beskytter mot
  // race conditions hvis to admins toggler samtidig.
  //
  // Bevisst .select() etter UPDATE: når RLS avviser stille (returnerer
  // tom array uten error), trenger vi å vite det — ellers ser brukeren
  // optimistic UI som flipper tilbake ved neste page load uten beskjed.
  async function handleToggleHq(target: Office) {
    const supabase = createClient()
    const next = !target.is_hq

    // Optimistic
    setOffices(prev => prev.map(o => ({
      ...o,
      is_hq: o.id === target.id ? next : (next ? false : o.is_hq),
    })))

    function rollback() {
      setOffices(prev => prev.map(o => ({
        ...o,
        is_hq: o.id === target.id ? !next : o.is_hq,
      })))
    }

    if (next) {
      const { data: cleared, error: clearErr } = await supabase
        .from('offices')
        .update({ is_hq: false })
        .eq('org_id', orgId)
        .eq('is_hq', true)
        .select()
      if (clearErr) {
        toast.error(`HQ-rens feilet: ${clearErr.message}`)
        rollback()
        return
      }
      // cleared kan trygt være tom (det er ingen forrige HQ å nullstille).
      void cleared
    }

    const { data, error } = await supabase
      .from('offices')
      .update({ is_hq: next })
      .eq('id', target.id)
      .select()

    if (error) {
      toast.error(`HQ-update feilet: ${error.message}`)
      rollback()
      return
    }
    if (!data || data.length === 0) {
      // RLS avviste stille, eller raden finnes ikke. Begge betyr at
      // optimistic UI lyver — rull tilbake og fortell brukeren.
      toast.error('Ingen rader oppdatert — sjekk admin-rettighet eller om kontoret eksisterer.')
      rollback()
      return
    }
    toast.success(next ? t.settings.offices.toastHqSet : t.settings.offices.toastHqUnset)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-[24px] font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
          >
            {t.settings.offices.title}
          </h1>
          <p className="text-[14px] mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {offices.length} {offices.length === 1 ? t.settings.offices.subtitleOne : t.settings.offices.subtitleMany}
          </p>
        </div>
        <motion.button
          onClick={openAdd}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
          style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          {t.common.add}
        </motion.button>
      </div>

      {/* Office list */}
      {offices.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-6 h-6" strokeWidth={1.5} />}
          title={t.settings.offices.empty}
          description={t.settings.offices.emptyHint}
        />
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
        >
          {offices.map((office, i) => {
            const hasCoords = office.latitude != null && office.longitude != null
            return (
              <div
                key={office.id}
                className="flex items-center gap-4 px-5 py-4"
                style={{ borderBottom: i < offices.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(0,102,255,0.08)' }}
                >
                  <MapPin className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--accent-color)' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className="text-[14px] font-medium truncate"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                    >
                      {office.name}
                    </p>
                    {office.is_hq && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider shrink-0"
                        style={{
                          backgroundColor: 'rgba(212,160,23,0.14)',
                          color: '#b8860b',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        <Star className="w-2.5 h-2.5" strokeWidth={2.5} fill="currentColor" />
                        {t.settings.offices.hqBadge}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] truncate" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                    {[office.address, office.postal_code, office.city].filter(Boolean).join(', ')}
                    {office.country_code ? ` · ${office.country_code}` : ''}
                    {office.timezone ? ` · ${office.timezone}` : ''}
                  </p>
                </div>

                {/* Coord status badge */}
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider shrink-0"
                  style={{
                    backgroundColor: hasCoords ? 'rgba(0,170,100,0.1)' : 'rgba(255,180,0,0.1)',
                    color: hasCoords ? '#0aa068' : '#c99700',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: hasCoords ? '#0aa068' : '#c99700' }}
                  />
                  {hasCoords ? 'På kartet' : 'Uten koord.'}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleHq(office)}
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-subtle)]"
                    style={{ color: office.is_hq ? '#b8860b' : 'var(--text-tertiary)' }}
                    title={office.is_hq ? t.settings.offices.unsetHq : t.settings.offices.setHq}
                    aria-pressed={office.is_hq}
                  >
                    <Star
                      className="w-4 h-4"
                      strokeWidth={1.5}
                      fill={office.is_hq ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    onClick={() => openEdit(office)}
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-subtle)]"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <Pencil className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => handleDelete(office.id)}
                    disabled={deleting === office.id}
                    className="p-2 rounded-lg transition-colors hover:bg-red-50 disabled:opacity-40"
                    style={{ color: deleting === office.id ? '#E63946' : 'var(--text-tertiary)' }}
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalMode !== 'closed' && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
              onClick={closeModal}
            />
            <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-[6vh] sm:pt-[8vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={spring.modal}
              className="tp-modal pointer-events-auto w-[520px] max-w-full max-h-[calc(100vh-10vh-1rem)] sm:max-h-[calc(100vh-12vh-2rem)] overflow-y-auto rounded-2xl p-4 sm:p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-[20px] font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
                >
                  {modalMode === 'add' ? t.settings.offices.modalAddTitle : t.settings.offices.modalEditTitle}
                </h2>
                <button onClick={closeModal} style={{ color: 'var(--text-tertiary)' }}>
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>

              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-6">
                  <OfficeField label={t.common.name}>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => updateForm('name', e.target.value)}
                      placeholder="f.eks. Oslo kontor"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>

                <div className="col-span-6">
                  <OfficeField
                    label="Adresse"
                    hint="Gate + nummer gir mest presis plassering"
                  >
                    <input
                      type="text"
                      value={form.address}
                      onChange={e => updateForm('address', e.target.value)}
                      placeholder="Storgata 1"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>

                <div className="col-span-2">
                  <OfficeField label="Postnummer">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.postal_code}
                      onChange={e => updateForm('postal_code', e.target.value)}
                      placeholder="2817"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none tabular-nums"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>

                <div className="col-span-4">
                  <OfficeField label="By">
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => updateForm('city', e.target.value)}
                      placeholder="Gjøvik"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>

                <div className="col-span-3">
                  <OfficeField label="Land" required hint="unngår feil by">
                    <CountryCombobox
                      value={form.country_code}
                      onChange={code => updateForm('country_code', code)}
                      ariaLabel="Velg land"
                    />
                  </OfficeField>
                </div>

                <div className="col-span-3">
                  <OfficeField label="Tidssone">
                    <input
                      type="text"
                      value={form.timezone}
                      onChange={e => updateForm('timezone', e.target.value)}
                      placeholder="Europe/Oslo"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>

                {/* Geocode panel — the star of the upgrade */}
                <div className="col-span-6">
                  <div
                    className="rounded-xl p-4 flex items-start gap-3"
                    style={{
                      background:
                        geo.state === 'done'
                          ? 'linear-gradient(135deg, rgba(10,160,104,0.08), rgba(10,160,104,0.02))'
                          : geo.state === 'error'
                            ? 'linear-gradient(135deg, rgba(230,57,70,0.08), rgba(230,57,70,0.02))'
                            : 'linear-gradient(135deg, rgba(0,102,255,0.08), rgba(0,102,255,0.02))',
                      border:
                        geo.state === 'done'
                          ? '1px solid rgba(10,160,104,0.25)'
                          : geo.state === 'error'
                            ? '1px solid rgba(230,57,70,0.25)'
                            : '1px solid rgba(0,102,255,0.2)',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        backgroundColor:
                          geo.state === 'done'
                            ? 'rgba(10,160,104,0.14)'
                            : geo.state === 'error'
                              ? 'rgba(230,57,70,0.14)'
                              : 'rgba(0,102,255,0.14)',
                        color:
                          geo.state === 'done'
                            ? '#0aa068'
                            : geo.state === 'error'
                              ? '#E63946'
                              : 'var(--accent-color)',
                      }}
                    >
                      {geo.state === 'working' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : geo.state === 'done' ? (
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[13px] font-semibold"
                        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                      >
                        {geo.state === 'done'
                          ? 'Plassert på kartet'
                          : geo.state === 'error'
                            ? 'Fant ikke adressen'
                            : 'Automatisk plassering'}
                      </p>
                      <p
                        className="text-[12px] mt-0.5 truncate"
                        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                      >
                        {geo.state === 'done'
                          ? geo.display
                          : geo.state === 'error'
                            ? geo.message
                            : geo.state === 'working'
                              ? 'Slår opp koordinater …'
                              : 'Fyll inn adresse/postnummer og la Offiview finne stedet.'}
                      </p>
                      {form.latitude && form.longitude && (
                        <p
                          className="text-[11px] mt-1 tabular-nums"
                          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-fraunces)' }}
                        >
                          {parseFloat(form.latitude).toFixed(4)}°N, {parseFloat(form.longitude).toFixed(4)}°E
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={runGeocode}
                      disabled={geo.state === 'working'}
                      className="shrink-0 self-center inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-60"
                      style={{
                        backgroundColor: 'var(--accent-color)',
                        color: 'white',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {geo.state === 'working' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      Finn på kart
                    </button>
                  </div>
                </div>

                <div className="col-span-6">
                  <CoordsMapPicker
                    lat={form.latitude ? parseFloat(form.latitude) || null : null}
                    lng={form.longitude ? parseFloat(form.longitude) || null : null}
                    countryCode={form.country_code || null}
                    onChange={(lat, lng) => {
                      setForm(f => ({
                        ...f,
                        latitude: lat.toFixed(6),
                        longitude: lng.toFixed(6),
                      }))
                      // Manuell pin-plassering — geocode-status skal ikke
                      // hevde adresse-treff når brukeren har dratt pinnen.
                      setGeo({ state: 'idle' })
                    }}
                  />
                </div>

                {/* Advanced: manual coord override */}
                <details className="col-span-6 group">
                  <summary
                    className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] list-none flex items-center gap-1.5 select-none"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                  >
                    <span className="transition-transform group-open:rotate-90">▸</span>
                    Skriv inn koordinater direkte
                  </summary>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <OfficeField label="Breddegrad">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.latitude}
                        onChange={e => updateForm('latitude', e.target.value)}
                        placeholder="59.913"
                        className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none tabular-nums"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                      />
                    </OfficeField>
                    <OfficeField label="Lengdegrad">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.longitude}
                        onChange={e => updateForm('longitude', e.target.value)}
                        placeholder="10.752"
                        className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none tabular-nums"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                      />
                    </OfficeField>
                  </div>
                </details>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-[13px] font-medium"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-subtle)', fontFamily: 'var(--font-body)' }}
                >
                  {t.common.cancel}
                </button>
                <motion.button
                  onClick={handleSave}
                  disabled={!form.name.trim() || saving}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
                  className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
                >
                  {saving ? '...' : modalMode === 'add' ? t.common.add : t.common.save}
                </motion.button>
              </div>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-subtle)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  border: '1.5px solid transparent',
}

function OfficeField({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
      >
        {label}
        {required && (
          <span
            className="ml-1 font-semibold"
            style={{ color: 'var(--accent-color)' }}
            aria-hidden
          >
            *
          </span>
        )}
        {hint && (
          <span
            className="ml-1.5 font-normal normal-case tracking-normal"
            style={{ color: 'var(--text-tertiary)' }}
          >
            · {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  )
}
