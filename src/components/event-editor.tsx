'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { OrgEvent, EventCategory } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { DateRangePicker } from '@/components/date-range-picker'

const CATEGORIES: Array<{ value: EventCategory; label: string; color: string }> = [
  { value: 'company',    label: 'Firmahendelse', color: '#0066FF' },
  { value: 'trade_show', label: 'Messe',         color: '#FF7A1A' },
  { value: 'training',   label: 'Kurs',          color: '#16A362' },
  { value: 'milestone',  label: 'Milepæl',       color: '#8B3FE6' },
  { value: 'holiday',    label: 'Fri/helligdag', color: '#E8B400' },
  { value: 'deadline',   label: 'Frist',         color: '#E63946' },
  { value: 'other',      label: 'Annet',         color: '#78716C' },
]

export const CATEGORY_COLORS: Record<EventCategory, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.value, c.color])
) as Record<EventCategory, string>

interface EventEditorProps {
  open: boolean
  onClose: () => void
  orgId: string
  event?: OrgEvent | null   // null = create new
}

export function EventEditor({ open, onClose, orgId, event }: EventEditorProps) {
  const isEdit = !!event

  const [title, setTitle]           = useState('')
  const [category, setCategory]     = useState<EventCategory>('company')
  const [startDate, setStartDate]   = useState('')
  const [endDate, setEndDate]       = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(event?.title ?? '')
      setCategory(event?.category ?? 'company')
      setStartDate(event?.start_date ?? '')
      setEndDate(event?.end_date ?? '')
      setDescription(event?.description ?? '')
    }
  }, [open, event])

  async function handleSave() {
    if (!title.trim() || !startDate || !endDate || saving) return
    setSaving(true)
    const supabase = createClient()

    const row = {
      org_id: orgId,
      title: title.trim(),
      category,
      start_date: startDate,
      end_date: endDate,
      description: description.trim() || null,
    }

    const { data, error } = isEdit
      ? await supabase.from('events').update(row).eq('id', event!.id).select()
      : await supabase.from('events').insert(row).select()

    setSaving(false)
    if (error) { toast.error(`Kunne ikke lagre: ${error.message}`); return }
    if (!data || data.length === 0) {
      toast.error('Ingen tilgang. Bare admin kan redigere hendelser.')
      return
    }
    toast.success(isEdit ? 'Hendelse oppdatert' : 'Hendelse lagt til')
    onClose()
  }

  async function handleDelete() {
    if (!event || saving) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('events').delete().eq('id', event.id).select()
    setSaving(false)
    if (error) { toast.error(`Kunne ikke slette: ${error.message}`); return }
    if (!data || data.length === 0) {
      toast.error('Ingen tilgang. Bare admin kan slette hendelser.')
      return
    }
    toast.success('Hendelse slettet')
    onClose()
  }

  const selectedCat = CATEGORIES.find(c => c.value === category)

  // Render via portal into document.body so ancestor transforms/filters
  // can't break position:fixed and push the modal out of the viewport.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(10,15,30,0.32)', backdropFilter: 'blur(8px) saturate(140%)', WebkitBackdropFilter: 'blur(8px) saturate(140%)' }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              transition={spring.bouncy}
              className="glass-panel pointer-events-auto w-[560px] max-w-full max-h-[calc(100vh-12vh-2rem)] overflow-y-auto rounded-3xl p-6 flex flex-col gap-5"
            >
            <h2
              className="text-[20px] font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
            >
              {isEdit ? 'Rediger hendelse' : 'Ny hendelse'}
            </h2>

            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Tittel
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="f.eks. Kickoff 2026, Julebord, Produktlansering..."
                className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', border: '1.5px solid transparent' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Kategori
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                    style={{
                      backgroundColor: category === c.value ? `${c.color}22` : 'var(--bg-subtle)',
                      color: category === c.value ? c.color : 'var(--text-secondary)',
                      border: `1.5px solid ${category === c.value ? c.color : 'transparent'}`,
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Periode
              </label>
              <div
                className="rounded-xl p-3"
                style={{ backgroundColor: 'var(--bg-subtle)' }}
              >
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
                  accentColor={selectedCat?.color ?? 'var(--accent-color)'}
                />
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Beskrivelse <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(valgfri)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Kort beskrivelse..."
                className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none resize-none"
                style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', border: '1.5px solid transparent' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {isEdit && (
                <button onClick={handleDelete} disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-medium disabled:opacity-40"
                  style={{ color: '#E63946', backgroundColor: 'rgba(230,57,70,0.08)', fontFamily: 'var(--font-body)' }}>
                  Slett
                </button>
              )}
              <div className="flex-1" />
              <button onClick={onClose} disabled={saving}
                className="px-4 py-2.5 rounded-xl text-[13px] font-medium"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-subtle)', fontFamily: 'var(--font-body)' }}>
                Avbryt
              </button>
              <motion.button
                onClick={handleSave}
                disabled={!title.trim() || !startDate || !endDate || saving}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
                className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: selectedCat?.color ?? 'var(--accent-color)', fontFamily: 'var(--font-body)' }}>
                {saving ? '...' : isEdit ? 'Lagre' : 'Legg til'}
              </motion.button>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
