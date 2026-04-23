'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, Briefcase, Sparkles, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { geocode } from '@/lib/geocode-client'
import type { Customer } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'

interface CustomersClientProps {
  orgId: string
  initialCustomers: Customer[]
}

interface CustomerFormState {
  name: string
  aliases: string            // comma-separated, stored as string[]
  city: string
  postal_code: string
  country_code: string
  address: string
  notes: string
  latitude: string
  longitude: string
}

const EMPTY_FORM: CustomerFormState = {
  name: '',
  aliases: '',
  city: '',
  postal_code: '',
  country_code: '',
  address: '',
  notes: '',
  latitude: '',
  longitude: '',
}

type GeocodeStatus =
  | { state: 'idle' }
  | { state: 'working' }
  | { state: 'done'; display: string }
  | { state: 'error'; message: string }

function aliasesToString(aliases: string[]): string {
  return aliases.join(', ')
}
function aliasesFromString(s: string): string[] {
  return s
    .split(',')
    .map(a => a.trim())
    .filter(Boolean)
}

export function CustomersClient({ orgId, initialCustomers }: CustomersClientProps) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed')
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [geo, setGeo] = useState<GeocodeStatus>({ state: 'idle' })
  const t = useT()

  const COUNTRY_OPTIONS = [
    { code: 'NO', label: t.countries.NO },
    { code: 'SE', label: t.countries.SE },
    { code: 'LT', label: t.countries.LT },
    { code: 'GB', label: t.countries.GB },
    { code: 'DE', label: t.countries.DE },
    { code: 'FR', label: t.countries.FR },
    { code: 'DK', label: t.countries.DK },
    { code: 'FI', label: t.countries.FI },
    { code: 'PL', label: t.countries.PL },
    { code: 'NL', label: t.countries.NL },
    { code: 'US', label: t.countries.US },
  ]

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditTarget(null)
    setGeo({ state: 'idle' })
    setModalMode('add')
  }

  function openEdit(c: Customer) {
    setForm({
      name: c.name,
      aliases: aliasesToString(c.aliases ?? []),
      city: c.city ?? '',
      postal_code: c.postal_code ?? '',
      country_code: c.country_code ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
      latitude: c.latitude?.toString() ?? '',
      longitude: c.longitude?.toString() ?? '',
    })
    setEditTarget(c)
    setGeo(c.latitude != null && c.longitude != null
      ? { state: 'done', display: [c.address, c.postal_code, c.city].filter(Boolean).join(', ') || 'Kjent posisjon' }
      : { state: 'idle' })
    setModalMode('edit')
  }

  function closeModal() { setModalMode('closed') }

  function updateForm<K extends keyof CustomerFormState>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    if (['address', 'postal_code', 'city', 'country_code'].includes(key)) {
      setGeo(s => s.state === 'done' ? { state: 'idle' } : s)
    }
    if ((key === 'latitude' || key === 'longitude') && value.trim()) {
      setGeo({ state: 'idle' })
    }
  }

  async function runGeocode(): Promise<{ lat: number; lng: number } | null> {
    const hasInput = [form.address, form.postal_code, form.city].some(v => v.trim())
    if (!hasInput) {
      setGeo({ state: 'error', message: 'Fyll inn by, postnummer eller adresse først' })
      toast.error(t.settings.customers.errorNeedAddress)
      return null
    }
    if (!form.country_code) {
      setGeo({ state: 'error', message: 'Velg land før du søker' })
      toast.error(t.settings.customers.errorNeedCountry)
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
        toast.error(t.settings.customers.errorNotFound)
        return null
      }
      if (hit.countryCode && hit.countryCode !== form.country_code) {
        setGeo({
          state: 'error',
          message: `Fant kun treff i ${hit.countryCode} — sjekk at by og land stemmer`,
        })
        toast.error(t.settings.customers.errorWrongCountry)
        return null
      }
      setForm(f => ({
        ...f,
        latitude: hit.lat.toFixed(6),
        longitude: hit.lng.toFixed(6),
        city: f.city || hit.city || f.city,
        postal_code: f.postal_code || hit.postalCode || f.postal_code,
      }))
      setGeo({ state: 'done', display: hit.displayName })
      return { lat: hit.lat, lng: hit.lng }
    } catch {
      setGeo({ state: 'error', message: 'Noe gikk galt' })
      toast.error(t.settings.customers.errorGeocode)
      return null
    }
  }

  async function handleSave() {
    if (!form.name.trim() || saving) return
    const hasAddressInput = [form.address, form.postal_code, form.city].some(v => v.trim())
    const hasManualCoords = form.latitude.trim() !== '' && form.longitude.trim() !== ''
    if (hasAddressInput && !hasManualCoords && !form.country_code) {
      toast.error(t.settings.customers.errorNeedCountrySave)
      return
    }
    setSaving(true)
    const supabase = createClient()

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
      aliases: aliasesFromString(form.aliases),
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      country_code: form.country_code || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      latitude: lat,
      longitude: lng,
    }

    if (modalMode === 'edit' && editTarget) {
      const { error } = await supabase.from('customers').update(row).eq('id', editTarget.id)
      setSaving(false)
      if (error) {
        toast.error(error.message.includes('duplicate') ? t.settings.customers.errorDuplicate : t.common.errorShort)
        return
      }
      setCustomers(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...row } : c))
      toast.success(t.settings.customers.toastUpdated)
    } else {
      const { data, error } = await supabase.from('customers').insert(row).select().single()
      setSaving(false)
      if (error) {
        toast.error(error.message.includes('duplicate') ? t.settings.customers.errorDuplicate : t.common.errorShort)
        return
      }
      setCustomers(prev => [...prev, data])
      toast.success(`${row.name} ${t.settings.customers.toastAddedSuffix}`)
    }
    closeModal()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const supabase = createClient()
    const { error } = await supabase.from('customers').delete().eq('id', id)
    setDeleting(null)
    if (error) { toast.error(t.common.errorShort); return }
    setCustomers(prev => prev.filter(c => c.id !== id))
    toast.success(t.settings.customers.toastDeleted)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-[24px] font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
          >
            {t.settings.customers.title}
          </h1>
          <p className="text-[14px] mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {customers.length} {customers.length === 1 ? t.settings.customers.subtitleOne : t.settings.customers.subtitleMany} · {t.settings.customers.subtitleSuffix}
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

      {customers.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center flex flex-col items-center gap-3"
          style={{ border: '2px dashed var(--border-subtle)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-subtle)' }}
          >
            <Briefcase className="w-6 h-6" strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
            {t.settings.customers.empty}
          </p>
          <p className="text-[13px] max-w-sm" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {t.settings.customers.emptyHint}
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
        >
          {customers.map((customer, i) => {
            const hasCoords = customer.latitude != null && customer.longitude != null
            return (
              <div
                key={customer.id}
                className="flex items-center gap-4 px-5 py-4"
                style={{ borderBottom: i < customers.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(255,122,26,0.10)' }}
                >
                  <Briefcase className="w-5 h-5" strokeWidth={1.5} style={{ color: '#FF7A1A' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-[14px] font-medium truncate"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    {customer.name}
                    {customer.aliases && customer.aliases.length > 0 && (
                      <span
                        className="ml-2 text-[11px] font-normal"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        alias: {customer.aliases.join(', ')}
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] truncate" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                    {[customer.address, customer.postal_code, customer.city].filter(Boolean).join(', ') || '—'}
                    {customer.country_code ? ` · ${customer.country_code}` : ''}
                  </p>
                </div>

                <span
                  className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider shrink-0"
                  style={{
                    backgroundColor: hasCoords ? 'rgba(10,160,104,0.1)' : 'rgba(255,180,0,0.1)',
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
                    onClick={() => openEdit(customer)}
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-subtle)]"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <Pencil className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => handleDelete(customer.id)}
                    disabled={deleting === customer.id}
                    className="p-2 rounded-lg transition-colors hover:bg-red-50 disabled:opacity-40"
                    style={{ color: deleting === customer.id ? '#E63946' : 'var(--text-tertiary)' }}
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={spring.bouncy}
              className="pointer-events-auto w-[540px] max-w-full max-h-[calc(100vh-12vh-2rem)] overflow-y-auto rounded-2xl p-6 flex flex-col gap-4"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                boxShadow: 'var(--shadow-xl)',
              }}
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-[20px] font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
                >
                  {modalMode === 'add' ? t.settings.customers.modalAddTitle : t.settings.customers.modalEditTitle}
                </h2>
                <button onClick={closeModal} style={{ color: 'var(--text-tertiary)' }}>
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>

              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-6">
                  <CustomerField label={t.common.name} required>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => updateForm('name', e.target.value)}
                      placeholder="f.eks. Diplomat"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </CustomerField>
                </div>

                <div className="col-span-6">
                  <CustomerField
                    label="Alias"
                    hint="komma-separert · hjelper AI å gjenkjenne varianter"
                  >
                    <input
                      type="text"
                      value={form.aliases}
                      onChange={e => updateForm('aliases', e.target.value)}
                      placeholder="Diplomat AS, Diplomat Skøyen"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </CustomerField>
                </div>

                <div className="col-span-6">
                  <CustomerField
                    label="Adresse"
                    hint="Gate + nummer gir mest presis plassering"
                  >
                    <input
                      type="text"
                      value={form.address}
                      onChange={e => updateForm('address', e.target.value)}
                      placeholder="Karenslyst allé 20"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </CustomerField>
                </div>

                <div className="col-span-2">
                  <CustomerField label="Postnummer">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.postal_code}
                      onChange={e => updateForm('postal_code', e.target.value)}
                      placeholder="0278"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none tabular-nums"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </CustomerField>
                </div>

                <div className="col-span-4">
                  <CustomerField label="By">
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => updateForm('city', e.target.value)}
                      placeholder="Oslo"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </CustomerField>
                </div>

                <div className="col-span-6">
                  <CustomerField label="Land" required hint="unngår feil by">
                    <select
                      value={form.country_code}
                      onChange={e => updateForm('country_code', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none appearance-none cursor-pointer"
                      style={{
                        ...inputStyle,
                        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A8A29E' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        paddingRight: '36px',
                      }}
                    >
                      <option value="">Velg land</option>
                      {COUNTRY_OPTIONS.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </CustomerField>
                </div>

                <div className="col-span-6">
                  <div
                    className="rounded-xl p-4 flex items-start gap-3"
                    style={{
                      background:
                        geo.state === 'done'
                          ? 'linear-gradient(135deg, rgba(10,160,104,0.08), rgba(10,160,104,0.02))'
                          : geo.state === 'error'
                            ? 'linear-gradient(135deg, rgba(230,57,70,0.08), rgba(230,57,70,0.02))'
                            : 'linear-gradient(135deg, rgba(255,122,26,0.08), rgba(255,122,26,0.02))',
                      border:
                        geo.state === 'done'
                          ? '1px solid rgba(10,160,104,0.25)'
                          : geo.state === 'error'
                            ? '1px solid rgba(230,57,70,0.25)'
                            : '1px solid rgba(255,122,26,0.2)',
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
                              : 'rgba(255,122,26,0.14)',
                        color:
                          geo.state === 'done'
                            ? '#0aa068'
                            : geo.state === 'error'
                              ? '#E63946'
                              : '#FF7A1A',
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
                          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-sora)' }}
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
                        backgroundColor: '#FF7A1A',
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
                  <CustomerField label="Notater" hint="valgfritt">
                    <textarea
                      value={form.notes}
                      onChange={e => updateForm('notes', e.target.value)}
                      placeholder="Kontaktperson, parkering, mm."
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none resize-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </CustomerField>
                </div>

                <details className="col-span-6 group">
                  <summary
                    className="cursor-pointer text-[11px] font-semibold uppercase tracking-widest list-none flex items-center gap-1.5 select-none"
                    style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                  >
                    <span className="transition-transform group-open:rotate-90">▸</span>
                    Juster koordinater manuelt
                  </summary>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <CustomerField label="Breddegrad">
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
                    </CustomerField>
                    <CustomerField label="Lengdegrad">
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
                    </CustomerField>
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

function CustomerField({
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
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
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
            style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}
          >
            · {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  )
}
