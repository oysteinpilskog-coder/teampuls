'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { StrategyStatus, StrategyTheme } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { STATUS_HEX } from './strategy-wheel'

const STATUS_ORDER: StrategyStatus[] = ['on_track', 'at_risk', 'off_track', 'done']

interface StrategyEditorProps {
  open: boolean
  onClose: () => void
  orgId: string
  year: number
  quarter: 1 | 2 | 3 | 4
  theme: StrategyTheme | null
  onMutated?: () => void
}

export function StrategyEditor({
  open, onClose, orgId, year, quarter, theme, onMutated,
}: StrategyEditorProps) {
  const t = useT()
  const isEdit = !!theme

  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [status, setStatus] = useState<StrategyStatus>('on_track')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(theme?.title ?? '')
      setGoal(theme?.goal ?? '')
      setStatus(theme?.status ?? 'on_track')
    }
  }, [open, theme])

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    const supabase = createClient()

    // Upsert on (org_id, year, quarter) — matches the unique key on
    // strategy_themes. Avoids needing to know whether a row exists yet.
    const row = {
      org_id: orgId,
      year,
      quarter,
      title: title.trim(),
      goal: goal.trim() || null,
      status,
    }

    const { data, error } = await supabase
      .from('strategy_themes')
      .upsert(row, { onConflict: 'org_id,year,quarter' })
      .select()

    setSaving(false)
    if (error) { toast.error(`${t.wheel.strategy.failedSavePrefix} ${error.message}`); return }
    if (!data || data.length === 0) {
      toast.error(t.wheel.strategy.adminOnly)
      return
    }
    toast.success(t.wheel.strategy.saved)
    onMutated?.()
    onClose()
  }

  async function handleDelete() {
    if (!theme || saving) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('strategy_themes')
      .delete()
      .eq('id', theme.id)
      .select()
    setSaving(false)
    if (error) { toast.error(`${t.wheel.strategy.failedDeletePrefix} ${error.message}`); return }
    if (!data || data.length === 0) {
      toast.error(t.wheel.strategy.adminOnly)
      return
    }
    toast.success(t.wheel.strategy.deleted)
    onMutated?.()
    onClose()
  }

  const accent = STATUS_HEX[status]

  // Portal mount guard — same pattern as EventEditor.
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
            style={{
              backgroundColor: 'rgba(10,15,30,0.32)',
              backdropFilter: 'blur(8px) saturate(140%)',
              WebkitBackdropFilter: 'blur(8px) saturate(140%)',
            }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-[6vh] sm:pt-[8vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={spring.modal}
              className="glass-panel pointer-events-auto w-[560px] max-w-full max-h-[calc(100vh-10vh-1rem)] sm:max-h-[calc(100vh-12vh-2rem)] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col gap-4 sm:gap-5"
            >
              <div className="flex items-baseline justify-between">
                <h2
                  className="text-[20px] font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
                >
                  {isEdit ? t.wheel.strategy.editTheme : t.wheel.strategy.newTheme}
                </h2>
                <span
                  className="text-[11px] font-bold uppercase"
                  style={{
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.22em',
                  }}
                >
                  {t.wheel.strategy.quarterLabel.replace('{n}', String(quarter))} · {year}
                </span>
              </div>

              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t.wheel.strategy.titleField}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={t.wheel.strategy.titlePlaceholder}
                  className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    border: '1.5px solid transparent',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                  autoFocus
                />
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t.wheel.strategy.statusLabel}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map(s => {
                    const c = STATUS_HEX[s]
                    const active = s === status
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                        style={{
                          backgroundColor: active ? `${c}22` : 'var(--bg-subtle)',
                          color: active ? c : 'var(--text-secondary)',
                          border: `1.5px solid ${active ? c : 'transparent'}`,
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: c,
                            boxShadow: active ? `0 0 6px ${c}aa` : 'none',
                          }}
                        />
                        {t.wheel.strategy.statuses[s]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Goal */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t.wheel.strategy.goalLabel}
                </label>
                <textarea
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  rows={4}
                  placeholder={t.wheel.strategy.goalPlaceholder}
                  className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none resize-none"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    border: '1.5px solid transparent',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {isEdit && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-4 py-2.5 rounded-xl text-[13px] font-medium disabled:opacity-40"
                    style={{
                      color: '#E63946',
                      backgroundColor: 'rgba(230,57,70,0.08)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {t.wheel.strategy.delete}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-medium"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-subtle)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {t.wheel.strategy.cancel}
                </button>
                <motion.button
                  onClick={handleSave}
                  disabled={!title.trim() || saving}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring.snappy}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: accent, fontFamily: 'var(--font-body)' }}
                >
                  {saving ? '...' : t.wheel.strategy.save}
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
