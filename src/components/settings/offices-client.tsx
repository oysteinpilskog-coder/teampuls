'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Office } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'

interface OfficesClientProps {
  orgId: string
  initialOffices: Office[]
}

interface OfficeFormState {
  name: string
  city: string
  country_code: string
  address: string
  timezone: string
  latitude: string
  longitude: string
}

const EMPTY_FORM: OfficeFormState = {
  name: '',
  city: '',
  country_code: '',
  address: '',
  timezone: '',
  latitude: '',
  longitude: '',
}

const COUNTRY_OPTIONS = [
  { code: 'NO', label: 'Norge' },
  { code: 'SE', label: 'Sverige' },
  { code: 'LT', label: 'Litauen' },
  { code: 'GB', label: 'Storbritannia' },
  { code: 'DE', label: 'Tyskland' },
  { code: 'FR', label: 'Frankrike' },
  { code: 'DK', label: 'Danmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'PL', label: 'Polen' },
  { code: 'NL', label: 'Nederland' },
  { code: 'US', label: 'USA' },
]

export function OfficesClient({ orgId, initialOffices }: OfficesClientProps) {
  const [offices, setOffices] = useState<Office[]>(initialOffices)
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed')
  const [editTarget, setEditTarget] = useState<Office | null>(null)
  const [form, setForm] = useState<OfficeFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditTarget(null)
    setModalMode('add')
  }

  function openEdit(o: Office) {
    setForm({
      name: o.name,
      city: o.city ?? '',
      country_code: o.country_code ?? '',
      address: o.address ?? '',
      timezone: o.timezone ?? '',
      latitude: o.latitude?.toString() ?? '',
      longitude: o.longitude?.toString() ?? '',
    })
    setEditTarget(o)
    setModalMode('edit')
  }

  function closeModal() { setModalMode('closed') }

  async function handleSave() {
    if (!form.name.trim() || saving) return
    setSaving(true)
    const supabase = createClient()

    const row = {
      org_id: orgId,
      name: form.name.trim(),
      city: form.city.trim() || null,
      country_code: form.country_code || null,
      address: form.address.trim() || null,
      timezone: form.timezone || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
    }

    if (modalMode === 'edit' && editTarget) {
      const { error } = await supabase.from('offices').update(row).eq('id', editTarget.id)
      setSaving(false)
      if (error) { toast.error('Noe gikk galt.'); return }
      setOffices(prev => prev.map(o => o.id === editTarget.id ? { ...o, ...row } : o))
      toast.success('Kontor oppdatert')
    } else {
      const { data, error } = await supabase.from('offices').insert(row).select().single()
      setSaving(false)
      if (error) { toast.error('Noe gikk galt.'); return }
      setOffices(prev => [...prev, data])
      toast.success(`${row.name} lagt til`)
    }
    closeModal()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const supabase = createClient()
    const { error } = await supabase.from('offices').delete().eq('id', id)
    setDeleting(null)
    if (error) { toast.error('Noe gikk galt.'); return }
    setOffices(prev => prev.filter(o => o.id !== id))
    toast.success('Kontor slettet')
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-[24px] font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
          >
            Kontorer
          </h1>
          <p className="text-[14px] mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {offices.length} {offices.length === 1 ? 'lokasjon' : 'lokasjoner'}
          </p>
        </div>
        <motion.button
          onClick={openAdd}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
          style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          Legg til
        </motion.button>
      </div>

      {/* Office list */}
      {offices.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center flex flex-col items-center gap-3"
          style={{ border: '2px dashed var(--border-subtle)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-subtle)' }}
          >
            <MapPin className="w-6 h-6" strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
            Ingen kontorer ennå
          </p>
          <p className="text-[13px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            Legg til firmaets lokasjoner for autokomplett og statistikk
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
        >
          {offices.map((office, i) => (
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
                <p
                  className="text-[14px] font-medium truncate"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                >
                  {office.name}
                </p>
                <p className="text-[12px] truncate" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                  {[office.city, office.country_code].filter(Boolean).join(', ')}
                  {office.timezone && ` · ${office.timezone}`}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
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
          ))}
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
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={spring.bouncy}
              className="fixed z-50 w-[480px] rounded-2xl p-6 flex flex-col gap-4"
              style={{
                top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-elevated)',
                boxShadow: 'var(--shadow-xl)',
              }}
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-[20px] font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
                >
                  {modalMode === 'add' ? 'Nytt kontor' : 'Rediger kontor'}
                </h2>
                <button onClick={closeModal} style={{ color: 'var(--text-tertiary)' }}>
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <OfficeField label="Navn">
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="f.eks. Oslo kontor"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>

                <OfficeField label="By">
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Oslo"
                    className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                  />
                </OfficeField>

                <OfficeField label="Land">
                  <select
                    value={form.country_code}
                    onChange={e => setForm(f => ({ ...f, country_code: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none appearance-none cursor-pointer"
                    style={{
                      ...inputStyle,
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23A8A29E\' stroke-width=\'1.5\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
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
                </OfficeField>

                <div className="col-span-2">
                  <OfficeField label="Adresse">
                    <input
                      type="text"
                      value={form.address}
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      placeholder="Gateveien 1, 0150 Oslo"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>

                <OfficeField label="Tidssone">
                  <input
                    type="text"
                    value={form.timezone}
                    onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                    placeholder="Europe/Oslo"
                    className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                  />
                </OfficeField>

                <div className="grid grid-cols-2 gap-2">
                  <OfficeField label="Breddegrad">
                    <input
                      type="text"
                      value={form.latitude}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                      placeholder="59.913"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                  <OfficeField label="Lengdegrad">
                    <input
                      type="text"
                      value={form.longitude}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                      placeholder="10.752"
                      className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                      style={inputStyle}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </OfficeField>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-[13px] font-medium"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-subtle)', fontFamily: 'var(--font-body)' }}
                >
                  Avbryt
                </button>
                <motion.button
                  onClick={handleSave}
                  disabled={!form.name.trim() || saving}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
                  className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
                >
                  {saving ? '...' : modalMode === 'add' ? 'Legg til' : 'Lagre'}
                </motion.button>
              </div>
            </motion.div>
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

function OfficeField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}
