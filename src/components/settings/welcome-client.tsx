'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Sparkles,
  MonitorPlay,
  Clock,
  CalendarDays,
  Building2,
  User2,
  StickyNote,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Visit, Member, WorkspaceSummary } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { toDateString } from '@/lib/dates'
import {
  WELCOME_PRE_WINDOW_MIN,
  WELCOME_POST_WINDOW_MIN,
} from '@/hooks/use-todays-visits'
import { WelcomeStage, type StageVisit } from './welcome-stage'
import { WorkspaceBadge } from '@/components/workspace-badge'

interface WelcomeClientProps {
  orgId: string
  /** Aktive org-ids: ett element i single-mode, alle i «Alle CalWin». */
  orgIds: string[]
  workspaces: WorkspaceSummary[]
  combinedView: boolean
  orgName: string
  currentMemberId: string
  initialVisits: Visit[]
  members: Member[]
}

interface VisitFormState {
  visitor_name: string
  visitor_company: string
  date: string
  start_hhmm: string
  end_hhmm: string
  host_member_id: string
  note: string
  target_org_id: string
}

function emptyForm(currentMemberId: string, defaultOrgId: string): VisitFormState {
  return {
    visitor_name: '',
    visitor_company: '',
    date: toDateString(new Date()),
    start_hhmm: '14:00',
    end_hhmm: '',
    host_member_id: currentMemberId,
    note: '',
    target_org_id: defaultOrgId,
  }
}

function trimSeconds(timeStr: string): string {
  return timeStr.length >= 5 ? timeStr.slice(0, 5) : timeStr
}

function toPgTime(hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${hhmm}:00`
}

type VisitStatus = 'upcoming' | 'window' | 'past'

function visitStatus(visit: Visit, now: Date): VisitStatus {
  const todayStr = toDateString(now)
  if (visit.date > todayStr) return 'upcoming'
  if (visit.date < todayStr) return 'past'

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = visit.start_time.split(':').map(Number)
  const startMin = sh * 60 + (sm ?? 0)
  const endMin = visit.end_time
    ? (() => {
        const [eh, em] = visit.end_time.split(':').map(Number)
        return eh * 60 + (em ?? 0)
      })()
    : startMin

  if (nowMin < startMin - WELCOME_PRE_WINDOW_MIN) return 'upcoming'
  if (nowMin > endMin + WELCOME_POST_WINDOW_MIN) return 'past'
  return 'window'
}

function formatLongDate(dateStr: string, locale = 'nb-NO'): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Visit → StageVisit. Stage doesn't care about ids/dates, just the on-stage shape. */
function toStage(v: Visit): StageVisit {
  return {
    id: v.id,
    visitor_name: v.visitor_name,
    visitor_company: v.visitor_company,
    start_time: v.start_time,
    note: v.note,
  }
}

/** FormState → StageVisit. Drives the live preview while the editor is open. */
function formToStage(form: VisitFormState, fallbackId: string): StageVisit {
  const start = form.start_hhmm && /^\d{2}:\d{2}$/.test(form.start_hhmm)
    ? `${form.start_hhmm}:00`
    : ''
  return {
    id: fallbackId,
    visitor_name: form.visitor_name.trim() || 'Forventet gjest',
    visitor_company: form.visitor_company.trim() || null,
    start_time: start,
    note: form.note.trim() || null,
  }
}

export function WelcomeClient({
  orgId,
  orgIds,
  workspaces,
  combinedView,
  orgName,
  currentMemberId,
  initialVisits,
  members,
}: WelcomeClientProps) {
  const t = useT()
  const router = useRouter()

  const workspaceById = useMemo(
    () => new Map(workspaces.map(w => [w.org_id, w])),
    [workspaces],
  )
  const targetWorkspaces = useMemo(
    () => workspaces.filter(w => orgIds.includes(w.org_id)),
    [workspaces, orgIds],
  )

  const [visits, setVisits] = useState<Visit[]>(initialVisits)
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed')
  const [editTarget, setEditTarget] = useState<Visit | null>(null)
  const [form, setForm] = useState<VisitFormState>(() => emptyForm(currentMemberId, orgId))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Realtime — settings list reflects AI/email-driven inserts and parallel
  // admin edits without a manual reload. Postgres-changes filter støtter ikke
  // IN-uttrykk, så i combined-view abonnerer vi uten org-filter og frafiltrerer
  // i klienten via orgIds-settet. I single-mode beholder vi `org_id=eq.X` så
  // Supabase ikke pusher fremmedhendelser over wiren.
  useEffect(() => {
    const supabase = createClient()
    const orgSet = new Set(orgIds)
    const filter = orgIds.length === 1 ? `org_id=eq.${orgIds[0]}` : undefined
    const channelName = orgIds.length === 1
      ? `settings-visits:org:${orgIds[0]}`
      : `settings-visits:all:${orgIds.slice().sort().join(',')}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        filter
          ? { event: '*', schema: 'public', table: 'visits', filter }
          : { event: '*', schema: 'public', table: 'visits' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Partial<Visit>
            if (!deleted.id) return
            setVisits(prev => prev.filter(v => v.id !== deleted.id))
            return
          }
          const upserted = payload.new as Visit
          if (!upserted?.id) return
          if (!orgSet.has(upserted.org_id)) return
          const today = toDateString(new Date())
          if (upserted.date < today) {
            setVisits(prev => prev.filter(v => v.id !== upserted.id))
            return
          }
          setVisits(prev => {
            const without = prev.filter(v => v.id !== upserted.id)
            return [...without, upserted].sort((a, b) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date)
              return a.start_time.localeCompare(b.start_time)
            })
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgIds])

  const memberById = useMemo(() => {
    const map = new Map<string, Member>()
    for (const m of members) map.set(m.id, m)
    return map
  }, [members])

  const grouped = useMemo(() => {
    const buckets = new Map<string, Visit[]>()
    for (const v of visits) {
      const list = buckets.get(v.date) ?? []
      list.push(v)
      buckets.set(v.date, list)
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({ date, list }))
  }, [visits])

  // What the stage shows. While editing/adding, the live form drives it
  // (single visit, frozen index). While idle, we cycle through the next
  // few real visits — what the TV will show through the day.
  const stageVisits = useMemo<StageVisit[]>(() => {
    if (modalMode !== 'closed') {
      return [formToStage(form, 'editing')]
    }
    if (visits.length === 0) return []
    return visits.slice(0, 6).map(toStage)
  }, [modalMode, form, visits])

  function openAdd() {
    setForm(emptyForm(currentMemberId, orgId))
    setEditTarget(null)
    setModalMode('add')
  }

  function openEdit(visit: Visit) {
    setForm({
      visitor_name: visit.visitor_name,
      visitor_company: visit.visitor_company ?? '',
      date: visit.date,
      start_hhmm: trimSeconds(visit.start_time),
      end_hhmm: visit.end_time ? trimSeconds(visit.end_time) : '',
      host_member_id: visit.host_member_id,
      note: visit.note ?? '',
      target_org_id: visit.org_id,
    })
    setEditTarget(visit)
    setModalMode('edit')
  }

  function closeModal() { setModalMode('closed') }

  function updateForm<K extends keyof VisitFormState>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const canSave =
    !!form.visitor_name.trim() &&
    !!form.date &&
    !!toPgTime(form.start_hhmm) &&
    !!form.host_member_id &&
    (form.end_hhmm === '' || !!toPgTime(form.end_hhmm)) &&
    !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const supabase = createClient()

    const start = toPgTime(form.start_hhmm)
    const end = form.end_hhmm ? toPgTime(form.end_hhmm) : null
    if (!start) {
      setSaving(false)
      toast.error(t.settings.welcome.errorBadTime)
      return
    }
    if (end && end <= start) {
      setSaving(false)
      toast.error(t.settings.welcome.errorEndBeforeStart)
      return
    }

    // Visit må følge vertens org så RLS-policyer treffer riktig — vi henter
    // det fra valgt host_member i stedet for fra form.target_org_id, som
    // bare brukes som forhåndsvalg i workspace-pickeren.
    const host = memberById.get(form.host_member_id)
    const scopeOrgId = modalMode === 'edit' && editTarget
      ? editTarget.org_id
      : (host?.org_id ?? form.target_org_id)
    const row = {
      org_id: scopeOrgId,
      visitor_name: form.visitor_name.trim(),
      visitor_company: form.visitor_company.trim() || null,
      date: form.date,
      start_time: start,
      end_time: end,
      host_member_id: form.host_member_id,
      note: form.note.trim() || null,
      source: 'manual' as const,
    }

    const sortVisits = (rows: Visit[]) => rows.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.start_time.localeCompare(b.start_time)
    })

    if (modalMode === 'edit' && editTarget) {
      const snapshot = editTarget
      setVisits(prev => sortVisits(
        prev.map(v => (v.id === editTarget.id ? { ...v, ...row } : v)),
      ))
      closeModal()
      toast.success(t.settings.welcome.toastUpdated)

      const { error } = await supabase.from('visits').update(row).eq('id', editTarget.id)
      setSaving(false)
      if (error) {
        setVisits(prev => prev.map(v => v.id === snapshot.id ? snapshot : v))
        toast.error(t.common.errorShort)
        return
      }
      router.refresh()
    } else {
      const tempId = `optimistic-${Date.now()}`
      const placeholder = { ...row, id: tempId } as Visit
      setVisits(prev => sortVisits([...prev, placeholder]))
      closeModal()
      toast.success(t.settings.welcome.toastAdded)

      const { data, error } = await supabase.from('visits').insert(row).select().single()
      setSaving(false)
      if (error) {
        setVisits(prev => prev.filter(v => v.id !== tempId))
        toast.error(t.common.errorShort)
        return
      }
      setVisits(prev => sortVisits(
        prev.map(v => v.id === tempId ? (data as Visit) : v),
      ))
      router.refresh()
    }
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    let snapshot: Visit | null = null
    setVisits(prev => {
      snapshot = prev.find(v => v.id === id) ?? null
      return prev.filter(v => v.id !== id)
    })
    setDeleting(id)
    toast.success(t.settings.welcome.toastDeleted)

    const { error } = await supabase.from('visits').delete().eq('id', id)
    setDeleting(null)
    if (error) {
      if (snapshot) setVisits(prev => [...prev, snapshot as Visit])
      toast.error(t.common.errorShort)
      return
    }
    router.refresh()
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="min-w-0">
          <h1
            className="calwin-bar text-[24px] font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
          >
            {t.settings.welcome.title}
          </h1>
          <p
            className="text-[14px] mt-0.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {visits.length === 0
              ? t.settings.welcome.subtitleEmpty
              : `${visits.length} ${visits.length === 1 ? t.settings.welcome.subtitleOne : t.settings.welcome.subtitleMany} · ${t.settings.welcome.subtitleSuffix}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/preview"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-subtle)',
              fontFamily: 'var(--font-body)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <MonitorPlay className="w-4 h-4" strokeWidth={1.5} />
            {t.settings.welcome.previewBtn}
          </Link>
          <motion.button
            onClick={openAdd}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={spring.snappy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
            style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            {t.common.add}
          </motion.button>
        </div>
      </div>

      {/* ── Live preview pane ─────────────────────────────────────────── */}
      <div className="mb-7 relative">
        <WelcomeStage
          visits={stageVisits}
          orgName={orgName}
          eyebrow={t.dashboard.welcome.eyebrow}
          atTemplate={t.dashboard.welcome.at}
          fromTemplate={t.dashboard.welcome.from}
          freeze={modalMode !== 'closed'}
        />
        <p
          className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] flex items-center gap-1.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          <span
            className="inline-block rounded-full"
            style={{
              width: 6,
              height: 6,
              background: 'var(--accent-color)',
              boxShadow: '0 0 8px var(--accent-color)',
            }}
          />
          {modalMode === 'closed'
            ? visits.length === 0
              ? 'Forhåndsvisning · slik vil TV-en se ut når noen er registrert'
              : visits.length === 1
                ? 'Forhåndsvisning · slik vil TV-en se ut'
                : `Forhåndsvisning · roterer mellom ${Math.min(visits.length, 6)} kommende besøk`
            : 'Live forhåndsvisning · TV-en vil se akkurat slik ut'}
        </p>
      </div>

      {/* ── List of visits ────────────────────────────────────────────── */}
      {visits.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center flex flex-col items-center gap-3"
          style={{ border: '2px dashed var(--border-subtle)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-subtle)' }}
          >
            <Sparkles className="w-6 h-6" strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p
            className="text-[15px] font-medium"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            {t.settings.welcome.empty}
          </p>
          <p
            className="text-[13px] max-w-md"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {t.settings.welcome.emptyHint}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(({ date, list }) => {
            const today = toDateString(now)
            const tomorrow = (() => {
              const d = new Date(now)
              d.setDate(d.getDate() + 1)
              return toDateString(d)
            })()
            const heading =
              date === today
                ? t.settings.welcome.groupToday
                : date === tomorrow
                  ? t.settings.welcome.groupTomorrow
                  : formatLongDate(date)
            return (
              <section key={date}>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-2"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                >
                  {heading}
                </p>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                >
                  {list.map((visit, i) => {
                    const status = visitStatus(visit, now)
                    const host = memberById.get(visit.host_member_id)
                    const startLabel = trimSeconds(visit.start_time)
                    const endLabel = visit.end_time ? trimSeconds(visit.end_time) : null
                    return (
                      <div
                        key={visit.id}
                        className="flex items-center gap-4 px-5 py-4"
                        style={{
                          borderBottom:
                            i < list.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        }}
                      >
                        <div
                          className="w-14 shrink-0 flex flex-col items-start"
                          style={{
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-fraunces)',
                          }}
                        >
                          <span className="text-[15px] font-semibold tabular-nums leading-none">
                            {startLabel}
                          </span>
                          {endLabel && (
                            <span
                              className="text-[11px] tabular-nums mt-0.5"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              –{endLabel}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p
                              className="text-[14px] font-medium truncate"
                              style={{
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-body)',
                              }}
                            >
                              {visit.visitor_name}
                              {visit.visitor_company && (
                                <span
                                  className="ml-1.5 font-normal"
                                  style={{ color: 'var(--text-tertiary)' }}
                                >
                                  · {visit.visitor_company}
                                </span>
                              )}
                            </p>
                            {combinedView && (
                              <WorkspaceBadge workspace={workspaceById.get(visit.org_id) ?? null} />
                            )}
                          </div>
                          <p
                            className="text-[12px] truncate"
                            style={{
                              color: 'var(--text-tertiary)',
                              fontFamily: 'var(--font-body)',
                            }}
                          >
                            {host
                              ? `${t.settings.welcome.hostLabel} ${host.display_name}`
                              : t.settings.welcome.hostMissing}
                            {visit.note ? ` · ${visit.note}` : ''}
                          </p>
                        </div>

                        <StatusPill status={status} t={t} />

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(visit)}
                            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-subtle)]"
                            style={{ color: 'var(--text-tertiary)' }}
                            aria-label={t.common.edit}
                          >
                            <Pencil className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => handleDelete(visit.id)}
                            disabled={deleting === visit.id}
                            className="p-2 rounded-lg transition-colors hover:bg-red-50 disabled:opacity-40"
                            style={{
                              color: deleting === visit.id ? '#E63946' : 'var(--text-tertiary)',
                            }}
                            aria-label={t.common.delete}
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* ── Editor sheet — split-screen with the live stage on the left ── */}
      <AnimatePresence>
        {modalMode !== 'closed' && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
              onClick={closeModal}
            />
            <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 pt-[5vh] sm:pt-6 pointer-events-none overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 10 }}
                transition={spring.modal}
                className="tp-modal pointer-events-auto w-full max-w-[960px] rounded-[22px] overflow-hidden flex flex-col"
              >
                {/* Header bar */}
                <div
                  className="flex items-center justify-between px-5 sm:px-7 py-4"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{
                        background: 'color-mix(in oklab, var(--accent-color) 15%, transparent)',
                        color: 'var(--accent-color)',
                      }}
                    >
                      <Sparkles className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <div>
                      <h2
                        className="text-[18px] font-semibold leading-tight"
                        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
                      >
                        {modalMode === 'add'
                          ? t.settings.welcome.modalAddTitle
                          : t.settings.welcome.modalEditTitle}
                      </h2>
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em] leading-tight mt-0.5"
                        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                      >
                        Live forhåndsvisning
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-subtle)]"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label={t.common.cancel}
                  >
                    <X className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                </div>

                {/* Body — split layout */}
                <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1fr]">
                  {/* Live stage column */}
                  <div
                    className="p-5 sm:p-6 flex flex-col gap-4"
                    style={{
                      background:
                        'linear-gradient(180deg, color-mix(in oklab, var(--accent-color) 6%, transparent) 0%, transparent 100%)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <WelcomeStage
                      visits={[formToStage(form, 'editor-stage')]}
                      orgName={orgName}
                      eyebrow={t.dashboard.welcome.eyebrow}
                      atTemplate={t.dashboard.welcome.at}
                      fromTemplate={t.dashboard.welcome.from}
                      freeze
                    />
                    <PreviewSummary form={form} memberById={memberById} t={t} />
                  </div>

                  {/* Form column */}
                  <div
                    className="p-5 sm:p-6 flex flex-col gap-3.5 max-h-[min(70vh,640px)] overflow-y-auto"
                    style={{ borderLeft: '1px solid var(--border-subtle)' }}
                  >
                    <Field
                      label={t.settings.welcome.fields.visitorName}
                      icon={<User2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      required
                    >
                      <input
                        type="text"
                        autoFocus
                        value={form.visitor_name}
                        onChange={e => updateForm('visitor_name', e.target.value)}
                        placeholder="Anna Hansen"
                        className="appleish-input"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                      />
                    </Field>

                    <Field
                      label={t.settings.welcome.fields.visitorCompany}
                      icon={<Building2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                    >
                      <input
                        type="text"
                        value={form.visitor_company}
                        onChange={e => updateForm('visitor_company', e.target.value)}
                        placeholder="Acme AS"
                        className="appleish-input"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                      />
                    </Field>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="col-span-3 sm:col-span-1">
                        <Field
                          label={t.settings.welcome.fields.date}
                          icon={<CalendarDays className="w-3.5 h-3.5" strokeWidth={1.5} />}
                          required
                        >
                          <input
                            type="date"
                            value={form.date}
                            onChange={e => updateForm('date', e.target.value)}
                            className="appleish-input tabular-nums"
                            style={inputStyle}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                          />
                        </Field>
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <Field
                          label={t.settings.welcome.fields.start}
                          icon={<Clock className="w-3.5 h-3.5" strokeWidth={1.5} />}
                          required
                        >
                          <input
                            type="time"
                            value={form.start_hhmm}
                            onChange={e => updateForm('start_hhmm', e.target.value)}
                            className="appleish-input tabular-nums"
                            style={inputStyle}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                          />
                        </Field>
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <Field
                          label={t.settings.welcome.fields.end}
                          hint={t.settings.welcome.fields.endHint}
                        >
                          <input
                            type="time"
                            value={form.end_hhmm}
                            onChange={e => updateForm('end_hhmm', e.target.value)}
                            className="appleish-input tabular-nums"
                            style={inputStyle}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                          />
                        </Field>
                      </div>
                    </div>

                    <Field
                      label={t.settings.welcome.fields.host}
                      icon={<Users className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      hint={t.settings.welcome.fields.hostHint}
                      required
                    >
                      <select
                        value={form.host_member_id}
                        onChange={e => updateForm('host_member_id', e.target.value)}
                        className="appleish-input"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                      >
                        {members.length === 0 && (
                          <option value="">{t.settings.welcome.fields.noMembers}</option>
                        )}
                        {/* I combined-view grupperer vi medlemmer per workspace
                            så det er åpenbart hvilken org en host hører til.
                            optgroup gir gratis visuelt skille i native <select>. */}
                        {combinedView
                          ? targetWorkspaces.map(w => {
                              const ws = members.filter(m => m.org_id === w.org_id)
                              if (ws.length === 0) return null
                              return (
                                <optgroup key={w.org_id} label={w.name}>
                                  {ws.map(m => (
                                    <option key={m.id} value={m.id}>
                                      {m.display_name}
                                    </option>
                                  ))}
                                </optgroup>
                              )
                            })
                          : members.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.display_name}
                              </option>
                            ))}
                      </select>
                    </Field>

                    <Field
                      label={t.settings.welcome.fields.note}
                      icon={<StickyNote className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      hint={t.settings.welcome.fields.noteHint}
                    >
                      <textarea
                        value={form.note}
                        onChange={e => updateForm('note', e.target.value)}
                        placeholder={t.settings.welcome.fields.notePlaceholder}
                        rows={2}
                        className="appleish-input resize-none"
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                      />
                    </Field>
                  </div>
                </div>

                {/* Footer */}
                <div
                  className="flex items-center justify-end gap-2 px-5 sm:px-7 py-4"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                >
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-[13px] font-medium transition-colors hover:bg-[var(--bg-subtle)]"
                    style={{
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {t.common.cancel}
                  </button>
                  <motion.button
                    onClick={handleSave}
                    disabled={!canSave}
                    whileHover={canSave ? { scale: 1.02 } : undefined}
                    whileTap={canSave ? { scale: 0.97 } : undefined}
                    transition={spring.snappy}
                    className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                    style={{
                      backgroundColor: 'var(--accent-color)',
                      fontFamily: 'var(--font-body)',
                      boxShadow: canSave
                        ? '0 6px 18px -6px color-mix(in oklab, var(--accent-color) 70%, transparent)'
                        : 'none',
                    }}
                  >
                    {saving
                      ? '...'
                      : modalMode === 'add'
                        ? t.common.add
                        : t.common.save}
                  </motion.button>
                </div>
              </motion.div>
            </div>

            <style jsx global>{`
              .appleish-input {
                width: 100%;
                padding: 0.625rem 0.875rem;
                border-radius: 0.75rem;
                font-size: 14px;
                outline: none;
                transition: border-color 120ms ease;
              }
              .appleish-input:focus { outline: none; }
            `}</style>
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

function Field({
  label,
  hint,
  required,
  icon,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[11px] font-semibold uppercase tracking-[0.16em] inline-flex items-center gap-1.5"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
      >
        {icon && <span style={{ color: 'var(--text-tertiary)' }}>{icon}</span>}
        {label}
        {required && (
          <span
            className="font-semibold"
            style={{ color: 'var(--accent-color)' }}
            aria-hidden
          >
            *
          </span>
        )}
        {hint && (
          <span
            className="ml-1 font-normal normal-case tracking-normal"
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

/**
 * Compact summary chip-row under the live stage in the editor — translates
 * the form state into the same plain-language facts the TV slide will show
 * (date, host name) so the admin sees both the visual rendering AND the
 * underlying truth in one glance.
 */
function PreviewSummary({
  form,
  memberById,
  t,
}: {
  form: VisitFormState
  memberById: Map<string, Member>
  t: ReturnType<typeof useT>
}) {
  const host = memberById.get(form.host_member_id)
  const dateLabel = form.date ? formatLongDate(form.date) : '—'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <SummaryChip icon={<CalendarDays className="w-3 h-3" strokeWidth={1.6} />} label={dateLabel} />
      {host && (
        <SummaryChip
          icon={<Users className="w-3 h-3" strokeWidth={1.6} />}
          label={`${t.settings.welcome.hostLabel} ${host.display_name}`}
        />
      )}
    </div>
  )
}

function SummaryChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
      style={{
        backgroundColor: 'var(--bg-subtle)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-body)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ color: 'var(--text-tertiary)' }}>{icon}</span>
      {label}
    </span>
  )
}

function StatusPill({
  status,
  t,
}: {
  status: VisitStatus
  t: ReturnType<typeof useT>
}) {
  const prefersReducedMotion = useReducedMotion()
  const cfg =
    status === 'window'
      ? {
          bg: 'var(--success-tint)',
          color: 'var(--success)',
          label: t.settings.welcome.statusWindow,
        }
      : status === 'upcoming'
        ? {
            bg: 'color-mix(in oklab, var(--accent-color) 12%, transparent)',
            color: 'var(--accent-color)',
            label: t.settings.welcome.statusUpcoming,
          }
        : {
            bg: 'color-mix(in oklab, var(--text-tertiary) 12%, transparent)',
            color: 'var(--text-tertiary)',
            label: t.settings.welcome.statusPast,
          }

  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-[0.16em] shrink-0"
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        fontFamily: 'var(--font-body)',
      }}
    >
      <StatusGlyph status={status} reducedMotion={!!prefersReducedMotion} />
      {cfg.label}
    </span>
  )
}

function StatusGlyph({ status, reducedMotion }: { status: VisitStatus; reducedMotion: boolean }) {
  const stroke = 'currentColor'
  if (status === 'window') {
    return (
      <span
        className="inline-flex items-center justify-center"
        style={{ width: 10, height: 10 }}
        aria-hidden
      >
        <span className="relative inline-flex" style={{ width: 6, height: 6 }}>
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: 'currentColor' }}
          />
          {!reducedMotion && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: 'currentColor' }}
              animate={{ opacity: [0.45, 0, 0.45], scale: [1, 2.1, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </span>
      </span>
    )
  }
  if (status === 'upcoming') {
    return (
      <svg viewBox="0 0 10 10" width="10" height="10" fill="none" aria-hidden>
        <circle cx="5" cy="5" r="3.6" stroke={stroke} strokeWidth="1.2" />
        <path d="M5 3.2v2l1.4 0.9" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" fill="none" aria-hidden>
      <path d="M2 5.4 4 7.5 8 3" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
