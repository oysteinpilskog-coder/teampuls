'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { StatusIcon, STATUS_COLORS } from '@/components/icons/status-icons'
import type { EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { no } from '@/lib/i18n/no'
import { useTheme } from 'next-themes'
import { DateRangePicker } from '@/components/date-range-picker'
import { addDays, differenceInDays, parseISO } from 'date-fns'
import { toDateString, MONTH_LONG_NB } from '@/lib/dates'

const ALL_STATUSES: EntryStatus[] = ['office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off']

interface CellEditorProps {
  open: boolean
  onClose: () => void
  orgId: string
  memberId: string
  memberName: string
  date: string          // 'YYYY-MM-DD'
  dateLabel: string     // e.g. 'Torsdag 21. april'
  initialStatus: EntryStatus | null
  initialLocation: string | null
  initialNote: string | null
}

export function CellEditor({
  open,
  onClose,
  orgId,
  memberId,
  memberName,
  date,
  dateLabel,
  initialStatus,
  initialLocation,
  initialNote,
}: CellEditorProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'

  const [status, setStatus] = useState<EntryStatus | null>(initialStatus)
  const [location, setLocation] = useState(initialLocation ?? '')
  const [note, setNote] = useState(initialNote ?? '')
  const [saving, setSaving] = useState(false)
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([])
  const locationInputRef = useRef<HTMLInputElement>(null)

  const [rangeStart, setRangeStart] = useState(date)
  const [rangeEnd, setRangeEnd]     = useState(date)

  // Reset form when the editor opens for a new cell
  useEffect(() => {
    if (open) {
      setStatus(initialStatus)
      setLocation(initialLocation ?? '')
      setNote(initialNote ?? '')
      setRangeStart(date)
      setRangeEnd(date)
    }
  }, [open, initialStatus, initialLocation, initialNote, date])

  // Fetch distinct location suggestions for this org
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase
      .from('entries')
      .select('location_label')
      .eq('org_id', orgId)
      .not('location_label', 'is', null)
      .limit(100)
      .then(({ data }) => {
        const unique = Array.from(
          new Set((data ?? []).map(r => r.location_label).filter(Boolean) as string[])
        ).sort()
        setLocationSuggestions(unique)
      })
  }, [open, orgId])

  // Keyboard: Esc to close, Enter to save
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement !== locationInputRef.current) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, status, location, note]) // eslint-disable-line react-hooks/exhaustive-deps

  function expandedDates(): string[] {
    if (!rangeStart || !rangeEnd) return [date]
    const start = parseISO(rangeStart)
    const end = parseISO(rangeEnd)
    const n = differenceInDays(end, start) + 1
    if (n <= 0) return [rangeStart]
    return Array.from({ length: n }, (_, i) => toDateString(addDays(start, i)))
  }

  async function handleSave() {
    if (!status || saving) return
    setSaving(true)
    const supabase = createClient()
    const dates = expandedDates()
    const rows = dates.map(d => ({
      org_id: orgId,
      member_id: memberId,
      date: d,
      status,
      location_label: location.trim() || null,
      note: note.trim() || null,
      source: 'manual' as const,
    }))
    const { error } = await supabase
      .from('entries')
      .upsert(rows, { onConflict: 'org_id,member_id,date' })
    setSaving(false)
    if (error) {
      toast.error(no.aiInput.error)
    } else {
      const suffix = dates.length > 1 ? ` · ${dates.length} dager` : ''
      toast.success(`${no.aiInput.success} — ${memberName}${suffix}`)
      onClose()
    }
  }

  async function handleDelete() {
    if (!initialStatus || saving) return
    setSaving(true)
    const supabase = createClient()
    const dates = expandedDates()
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('org_id', orgId)
      .eq('member_id', memberId)
      .in('date', dates)
    setSaving(false)
    if (error) {
      toast.error(no.aiInput.error)
    } else {
      onClose()
    }
  }

  const selectedColors = status ? STATUS_COLORS[status] : null

  // Render via portal so ancestor transforms/filters (matrix backdrop-blur etc.)
  // can't break position:fixed and push the modal out of the viewport.
  const [mountedInDom, setMountedInDom] = useState(false)
  useEffect(() => { setMountedInDom(true) }, [])
  if (!mountedInDom) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Editor card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={spring.bouncy}
            className="fixed z-50 w-[560px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-6 flex flex-col gap-5"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'var(--bg-elevated)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Header */}
            <div>
              <p
                className="text-[13px] font-medium uppercase tracking-widest mb-0.5"
                style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
              >
                {(() => {
                  if (rangeStart === rangeEnd) return dateLabel
                  const s = parseISO(rangeStart)
                  const e = parseISO(rangeEnd)
                  const n = differenceInDays(e, s) + 1
                  const fmt = (d: Date) => `${d.getDate()}. ${MONTH_LONG_NB[d.getMonth()].slice(0, 3)}`
                  return `${fmt(s)} – ${fmt(e)} · ${n} dager`
                })()}
              </p>
              <h2
                className="text-[20px] font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
              >
                {memberName}
              </h2>
            </div>

            {/* Date range picker */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Periode
              </label>
              <div
                className="rounded-xl p-3"
                style={{ backgroundColor: 'var(--bg-subtle)' }}
              >
                <DateRangePicker
                  startDate={rangeStart}
                  endDate={rangeEnd}
                  onChange={(s, e) => { setRangeStart(s); setRangeEnd(e) }}
                  accentColor={selectedColors
                    ? (isDark ? selectedColors.textDark : selectedColors.text)
                    : 'var(--accent-color)'}
                />
              </div>
            </div>

            {/* Status picker */}
            <div className="flex flex-col gap-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Status
              </span>
              <div className="flex gap-1.5">
                {ALL_STATUSES.map(s => {
                  const colors = STATUS_COLORS[s]
                  const isSelected = status === s
                  const bg = isSelected
                    ? (isDark ? colors.bgDark : colors.bg)
                    : 'var(--bg-subtle)'
                  return (
                    <motion.button
                      key={s}
                      onClick={() => setStatus(isSelected ? null : s)}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.94 }}
                      transition={spring.snappy}
                      className="flex-1 h-10 rounded-xl flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                      style={{
                        backgroundColor: bg,
                        boxShadow: isSelected ? 'var(--shadow-sm)' : undefined,
                      }}
                      title={no.status[s]}
                      aria-label={no.status[s]}
                      aria-pressed={isSelected}
                    >
                      <StatusIcon
                        status={s}
                        size={18}
                        color={isSelected
                          ? (isDark ? colors.textDark : colors.icon)
                          : 'var(--text-tertiary)'
                        }
                      />
                    </motion.button>
                  )
                })}
              </div>
              {/* Selected status label */}
              <AnimatePresence mode="wait">
                {status && (
                  <motion.p
                    key={status}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="text-[13px] font-medium text-center"
                    style={{
                      color: selectedColors
                        ? (isDark ? selectedColors.textDark : selectedColors.text)
                        : 'var(--text-secondary)',
                    }}
                  >
                    {no.status[status]}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Location field */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {no.editor.location}
              </label>
              <input
                ref={locationInputRef}
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={no.editor.locationPlaceholder}
                list="location-suggestions"
                autoComplete="off"
                className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  border: '1.5px solid transparent',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
              />
              <datalist id="location-suggestions">
                {locationSuggestions.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            {/* Note field */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {no.editor.note}
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={no.editor.notePlaceholder}
                autoComplete="off"
                className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  border: '1.5px solid transparent',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              {/* Delete — only when editing an existing entry */}
              {initialStatus && (
                <motion.button
                  onClick={handleDelete}
                  disabled={saving}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring.snappy}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-40"
                  style={{
                    color: '#E63946',
                    backgroundColor: 'rgba(230,57,70,0.08)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {no.editor.delete}
                </motion.button>
              )}

              <div className="flex-1" />

              {/* Cancel */}
              <motion.button
                onClick={onClose}
                disabled={saving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                className="px-4 py-2.5 rounded-xl text-[13px] font-medium disabled:opacity-40"
                style={{
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-subtle)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {no.editor.cancel}
              </motion.button>

              {/* Save */}
              <motion.button
                onClick={handleSave}
                disabled={!status || saving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--accent-color)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {saving ? '...' : no.editor.save}
              </motion.button>
            </div>

            {/* Keyboard hint */}
            <p
              className="text-[11px] text-center -mt-2"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              Enter lagre · Esc avbryt
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
