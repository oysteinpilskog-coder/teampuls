'use client'

/**
 * Weekly status email — settings + live preview.
 *
 * Lar admin slå på/av ukentlig status-mail, plukke ukedag og klokkeslett,
 * bestemme hva som skal skje på helligdager, og hvem som skal få mailen.
 * Selve sender-jobben (cron + outbound provider) er ikke implementert
 * ennå — denne siden lagrer kun konfigurasjonen og viser et live eksempel
 * av hva som *kommer* til å bli sendt.
 *
 * Preview-en bruker neste ISO-uke fra databasen så admin ser et ekte
 * teamlandskap — ikke en lorem-ipsum mock.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Mail, Calendar, AlertTriangle, Send, Eye } from 'lucide-react'
import { addDays, format, type Locale as DateFnsLocale } from 'date-fns'
import { nb, enGB, sv, es, lt as ltLocale } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import type { Organization, Member, EntryStatus } from '@/lib/supabase/types'
import { getHolidayForDate, isSupportedCountry } from '@/lib/holidays'
import { spring } from '@/lib/motion'
import { mergeHexColors } from '@/lib/status-colors/defaults'

type HolidayStrategy = 'skip' | 'next_workday' | 'send_anyway'
type RecipientMode = 'all_members' | 'admins_only' | 'custom'

type SampleEntry = {
  member_id: string
  date: string
  status: EntryStatus
  location_label: string | null
}

type SlimMember = Pick<
  Member,
  'id' | 'display_name' | 'email' | 'role' | 'is_active' | 'home_office_id'
>

interface Props {
  org: Organization
  members: SlimMember[]
  sampleEntries: SampleEntry[]
  sampleWeekNumber: number
  sampleWeekStartIso: string
  currentUserEmail: string
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

function isoWeekdayToKey(iso: number): WeekdayKey {
  return WEEKDAY_KEYS[Math.max(0, Math.min(6, iso - 1))]
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-subtle)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  border: '1.5px solid transparent',
}

export function WeeklyEmailClient({
  org: initialOrg,
  members,
  sampleEntries,
  sampleWeekNumber,
  sampleWeekStartIso,
  currentUserEmail,
}: Props) {
  const t = useT()
  const locale = useLocale()
  const [org, setOrg] = useState(initialOrg)

  const [enabled, setEnabled] = useState(initialOrg.weekly_email_enabled ?? false)
  const [weekday, setWeekday] = useState<number>(initialOrg.weekly_email_weekday ?? 1)
  const [hour, setHour] = useState<number>(initialOrg.weekly_email_hour ?? 9)
  const [minute, setMinute] = useState<number>(initialOrg.weekly_email_minute ?? 0)
  const [holidayStrategy, setHolidayStrategy] = useState<HolidayStrategy>(
    (initialOrg.weekly_email_holiday_strategy as HolidayStrategy) ?? 'next_workday'
  )
  const [recipients, setRecipients] = useState<RecipientMode>(
    (initialOrg.weekly_email_recipients as RecipientMode) ?? 'all_members'
  )
  const [customRecipientsText, setCustomRecipientsText] = useState<string>(
    (initialOrg.weekly_email_custom_recipients ?? []).join('\n')
  )
  const [subject, setSubject] = useState(initialOrg.weekly_email_subject ?? '')
  const [intro, setIntro] = useState(initialOrg.weekly_email_intro ?? '')
  const [saving, setSaving] = useState(false)

  // ---- Helpers --------------------------------------------------------

  const dateLocale = useMemo<DateFnsLocale>(() => {
    const map = { no: nb, en: enGB, sv, es, lt: ltLocale } as const
    return map[locale] ?? nb
  }, [locale])

  const country = isSupportedCountry(org.country_code) ? org.country_code : 'NO'
  const palette = mergeHexColors(org.status_colors)

  const sampleWeekStart = useMemo(
    () => new Date(`${sampleWeekStartIso}T00:00:00`),
    [sampleWeekStartIso]
  )

  // The configured send-day in the upcoming-week sample.
  const configuredSendDate = addDays(sampleWeekStart, weekday - 1)

  // Resolve the *actual* send date once holidays are taken into account.
  const resolvedSend = useMemo(() => {
    const holiday = getHolidayForDate(configuredSendDate, country)
    if (!holiday) {
      return { date: configuredSendDate, willSkip: false, holiday: null as string | null }
    }
    if (holidayStrategy === 'send_anyway') {
      return { date: configuredSendDate, willSkip: false, holiday: holiday.name }
    }
    if (holidayStrategy === 'skip') {
      return { date: configuredSendDate, willSkip: true, holiday: holiday.name }
    }
    // next_workday — try mon..fri in this ISO-week, never spill over
    for (let i = 0; i < 5; i++) {
      const probe = addDays(sampleWeekStart, i)
      const isWeekend = i >= 5 // never; we only loop 0..4
      const probeHoliday = getHolidayForDate(probe, country)
      if (!isWeekend && !probeHoliday && probe >= configuredSendDate) {
        return { date: probe, willSkip: false, holiday: holiday.name }
      }
    }
    return { date: configuredSendDate, willSkip: true, holiday: holiday.name }
  }, [configuredSendDate, sampleWeekStart, country, holidayStrategy])

  const recipientList = useMemo(() => {
    if (recipients === 'admins_only') {
      return members
        .filter((m) => m.role === 'admin' && m.email)
        .map((m) => ({ name: m.display_name, email: m.email }))
    }
    if (recipients === 'custom') {
      return customRecipientsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((email) => ({ name: email.split('@')[0], email }))
    }
    return members
      .filter((m) => m.email)
      .map((m) => ({ name: m.display_name, email: m.email }))
  }, [recipients, members, customRecipientsText])

  const isDirty =
    enabled !== (org.weekly_email_enabled ?? false) ||
    weekday !== (org.weekly_email_weekday ?? 1) ||
    hour !== (org.weekly_email_hour ?? 9) ||
    minute !== (org.weekly_email_minute ?? 0) ||
    holidayStrategy !== ((org.weekly_email_holiday_strategy as HolidayStrategy) ?? 'next_workday') ||
    recipients !== ((org.weekly_email_recipients as RecipientMode) ?? 'all_members') ||
    customRecipientsText !==
      (org.weekly_email_custom_recipients ?? []).join('\n') ||
    subject !== (org.weekly_email_subject ?? '') ||
    intro !== (org.weekly_email_intro ?? '')

  function validateCustomEmails(): string | null {
    if (recipients !== 'custom') return null
    const lines = customRecipientsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const l of lines) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l)) return l
    }
    return null
  }

  async function handleSave() {
    if (saving || !isDirty) return
    const bad = validateCustomEmails()
    if (bad) {
      toast.error(`${t.settings.email.errorInvalidEmail} (${bad})`)
      return
    }

    setSaving(true)
    const supabase = createClient()
    const customList = customRecipientsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const payload = {
      weekly_email_enabled: enabled,
      weekly_email_weekday: weekday,
      weekly_email_hour: hour,
      weekly_email_minute: minute,
      weekly_email_holiday_strategy: holidayStrategy,
      weekly_email_recipients: recipients,
      weekly_email_custom_recipients: customList,
      weekly_email_subject: subject.trim() || null,
      weekly_email_intro: intro.trim() || null,
    }

    const { error } = await supabase
      .from('organizations')
      .update(payload)
      .eq('id', org.id)

    setSaving(false)
    if (error) {
      console.error('[settings/email] save failed:', error)
      toast.error(`${t.settings.email.errorSave} (${error.code ?? 'ukjent'}: ${error.message})`)
      return
    }

    setOrg((o) => ({ ...o, ...payload }))
    toast.success(t.settings.email.savedToast)
  }

  // ---- Render ---------------------------------------------------------

  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const weekdayLabel = t.settings.email.weekdays[isoWeekdayToKey(weekday)]
  const sendDateLabel = format(resolvedSend.date, 'EEEE d. MMM', { locale: dateLocale })

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-[24px] font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
        >
          {t.settings.email.title}
        </h1>
        <p
          className="text-[14px] mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.settings.email.subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Settings card */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          {/* Enabled */}
          <Field label={t.settings.email.enabled} description={t.settings.email.enabledDesc}>
            <div className="flex flex-col gap-1.5">
              <RadioRow
                checked={enabled}
                onClick={() => setEnabled(true)}
                label={t.settings.email.enabledOn}
              />
              <RadioRow
                checked={!enabled}
                onClick={() => setEnabled(false)}
                label={t.settings.email.enabledOff}
              />
            </div>
          </Field>

          {/* Schedule */}
          <Field label={t.settings.email.schedule} description={t.settings.email.scheduleDesc}>
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {t.settings.email.weekdayLabel}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_KEYS.map((k, i) => {
                    const iso = i + 1
                    const active = weekday === iso
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setWeekday(iso)}
                        className="px-3 py-2 rounded-xl text-[13px] font-medium transition-[background,border-color,color] duration-150"
                        style={{
                          background: active
                            ? 'color-mix(in oklab, var(--accent-color) 14%, var(--bg-subtle))'
                            : 'var(--bg-subtle)',
                          border: `1px solid ${
                            active
                              ? 'color-mix(in oklab, var(--accent-color) 45%, transparent)'
                              : 'var(--border-subtle)'
                          }`,
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {t.settings.email.weekdaysShort[k]}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {t.settings.email.timeLabel}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setHour(Math.max(0, Math.min(23, Math.round(n))))
                    }}
                    className="w-16 px-2 py-2 rounded-xl text-[14px] outline-none text-center tabular-nums"
                    style={inputStyle}
                  />
                  <span style={{ color: 'var(--text-tertiary)' }}>:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    step={5}
                    value={minute}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setMinute(Math.max(0, Math.min(59, Math.round(n))))
                    }}
                    className="w-16 px-2 py-2 rounded-xl text-[14px] outline-none text-center tabular-nums"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </Field>

          {/* Holiday strategy */}
          <Field label={t.settings.email.holiday} description={t.settings.email.holidayDesc}>
            <div className="flex flex-col gap-1.5">
              <RadioRow
                checked={holidayStrategy === 'skip'}
                onClick={() => setHolidayStrategy('skip')}
                label={t.settings.email.holidaySkip}
                hint={t.settings.email.holidaySkipHint}
              />
              <RadioRow
                checked={holidayStrategy === 'next_workday'}
                onClick={() => setHolidayStrategy('next_workday')}
                label={t.settings.email.holidayNextWorkday}
                hint={t.settings.email.holidayNextWorkdayHint}
              />
              <RadioRow
                checked={holidayStrategy === 'send_anyway'}
                onClick={() => setHolidayStrategy('send_anyway')}
                label={t.settings.email.holidaySendAnyway}
                hint={t.settings.email.holidaySendAnywayHint}
              />
            </div>
          </Field>

          {/* Recipients */}
          <Field label={t.settings.email.recipients} description={t.settings.email.recipientsDesc}>
            <div className="flex flex-col gap-1.5">
              <RadioRow
                checked={recipients === 'all_members'}
                onClick={() => setRecipients('all_members')}
                label={t.settings.email.recipientsAll}
                hint={t.settings.email.recipientsAllHint}
              />
              <RadioRow
                checked={recipients === 'admins_only'}
                onClick={() => setRecipients('admins_only')}
                label={t.settings.email.recipientsAdmins}
                hint={t.settings.email.recipientsAdminsHint}
              />
              <RadioRow
                checked={recipients === 'custom'}
                onClick={() => setRecipients('custom')}
                label={t.settings.email.recipientsCustom}
                hint={t.settings.email.recipientsCustomHint}
              />
              {recipients === 'custom' && (
                <textarea
                  rows={4}
                  value={customRecipientsText}
                  onChange={(e) => setCustomRecipientsText(e.target.value)}
                  placeholder={t.settings.email.recipientsCustomPlaceholder}
                  className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none mt-2 font-mono"
                  style={inputStyle}
                />
              )}
            </div>
          </Field>

          {/* Content */}
          <Field label={t.settings.email.content} description={t.settings.email.contentDesc}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {t.settings.email.subjectLabel}
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t.settings.email.subjectPlaceholder}
                  className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                  style={inputStyle}
                />
                <span className="text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>
                  {t.settings.email.subjectHint}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {t.settings.email.introLabel}
                </span>
                <textarea
                  rows={3}
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  placeholder={t.settings.email.introPlaceholder}
                  className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                  style={inputStyle}
                />
                <span className="text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>
                  {t.settings.email.introHint}
                </span>
              </div>
            </div>
          </Field>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <motion.button
              onClick={handleSave}
              disabled={!isDirty || saving}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              className="px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
            >
              {saving ? '…' : t.settings.email.saveButton}
            </motion.button>
          </div>
        </div>

        {/* Schedule resolution banner */}
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{
            backgroundColor: resolvedSend.willSkip
              ? 'color-mix(in oklab, var(--warning) 10%, var(--bg-elevated))'
              : 'var(--bg-elevated)',
            border: `1px solid ${
              resolvedSend.holiday
                ? 'color-mix(in oklab, var(--warning) 35%, transparent)'
                : 'var(--border-subtle)'
            }`,
          }}
        >
          {resolvedSend.holiday ? (
            <AlertTriangle
              className="w-4 h-4 shrink-0"
              strokeWidth={1.75}
              style={{ color: 'var(--warning)' }}
            />
          ) : (
            <Calendar
              className="w-4 h-4 shrink-0"
              strokeWidth={1.75}
              style={{ color: 'var(--accent-color)' }}
            />
          )}
          <div className="flex flex-col gap-0.5 text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
            <span style={{ color: 'var(--text-primary)' }}>
              {t.settings.email.previewSendNote}: {weekdayLabel.toLowerCase()} {timeStr}
              {' · '}
              {t.settings.email.preview} ({t.settings.email.previewWeekHeading} {sampleWeekNumber}):{' '}
              {resolvedSend.willSkip
                ? t.settings.email.previewWillSkip
                : t.settings.email.previewWillSendOn
                    .replace('{date}', sendDateLabel)
                    .replace('{time}', timeStr)}
            </span>
            {resolvedSend.holiday && (
              <span style={{ color: 'var(--text-tertiary)' }}>
                {t.settings.email.previewHolidayNotice
                  .replace(
                    '{date}',
                    format(configuredSendDate, 'EEEE d. MMM', { locale: dateLocale })
                  )
                  .replace('{holiday}', resolvedSend.holiday)}
              </span>
            )}
          </div>
        </div>

        {/* Live email preview */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Eye
              className="w-4 h-4"
              strokeWidth={1.75}
              style={{ color: 'var(--accent-color)' }}
            />
            <h2
              className="text-[16px] font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            >
              {t.settings.email.preview}
            </h2>
          </div>
          <p
            className="text-[12.5px] -mt-2"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {t.settings.email.previewDesc}
          </p>

          <EmailPreview
            org={org}
            members={members}
            entries={sampleEntries}
            weekNumber={sampleWeekNumber}
            weekStart={sampleWeekStart}
            recipientList={recipientList}
            subject={subject}
            intro={intro}
            palette={palette}
            currentUserEmail={currentUserEmail}
            t={t}
            dateLocale={dateLocale}
          />
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Email preview — pseudo-rendering of the outgoing message
// =====================================================================

function EmailPreview({
  org,
  members,
  entries,
  weekNumber,
  weekStart,
  recipientList,
  subject,
  intro,
  palette,
  currentUserEmail,
  t,
  dateLocale,
}: {
  org: Organization
  members: SlimMember[]
  entries: SampleEntry[]
  weekNumber: number
  weekStart: Date
  recipientList: { name: string; email: string }[]
  subject: string
  intro: string
  palette: ReturnType<typeof mergeHexColors>
  currentUserEmail: string
  t: Dictionary
  dateLocale: DateFnsLocale
}) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  const STATUSES: EntryStatus[] = ['office', 'remote', 'customer', 'event', 'travel', 'vacation', 'sick', 'off']

  const resolvedSubject = (subject.trim() || `Ukens plan — ${org.name}`)
    .replace(/\{orgName\}/g, org.name)
    .replace(/\{weekNumber\}/g, String(weekNumber))

  const resolvedIntro =
    intro.trim() ||
    'Hei alle sammen! Her er ukens oversikt — gi beskjed hvis noe må justeres.'

  const senderEmail =
    org.inbound_email && org.inbound_email.includes('@')
      ? org.inbound_email
      : `noreply@teampulse.app`

  const fromName = `${org.name} · TeamPulse`

  const recipientPreviewLine =
    recipientList.length === 0
      ? '—'
      : recipientList.length <= 3
        ? recipientList.map((r) => r.email).join(', ')
        : `${recipientList[0].email}, ${recipientList[1].email}, +${recipientList.length - 2}`

  // Build per-member status array for the preview week.
  const byMemberDate = new Map<string, SampleEntry>()
  for (const e of entries) byMemberDate.set(`${e.member_id}_${e.date}`, e)

  const visibleMembers = members.filter((m) => m.is_active).slice(0, 8)

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: '#FFFFFF',
        border: '1px solid var(--border-subtle)',
        color: '#0F172A',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Mail headers */}
      <div
        className="px-5 py-3 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[12.5px]"
        style={{
          background: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          color: '#475569',
        }}
      >
        <span className="font-semibold uppercase tracking-[0.12em] text-[10.5px]">
          {t.settings.email.previewFromLabel}
        </span>
        <span style={{ color: '#0F172A' }}>
          {fromName} &lt;{senderEmail}&gt;
        </span>
        <span className="font-semibold uppercase tracking-[0.12em] text-[10.5px]">
          {t.settings.email.previewToLabel}
        </span>
        <span style={{ color: '#0F172A' }}>{recipientPreviewLine || currentUserEmail}</span>
        <span className="font-semibold uppercase tracking-[0.12em] text-[10.5px]">
          {t.settings.email.previewSubjectLabel}
        </span>
        <span className="font-semibold" style={{ color: '#0F172A' }}>
          {resolvedSubject}
        </span>
      </div>

      {/* Mail body */}
      <div className="px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {org.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt={org.name}
              className="w-10 h-10 rounded-xl object-contain"
              style={{ background: '#F1F5F9' }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold"
              style={{ background: org.primary_color, color: '#fff' }}
            >
              {org.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col">
            <span
              className="text-[18px] font-bold"
              style={{ color: '#0F172A', fontFamily: 'var(--font-fraunces)' }}
            >
              {t.settings.email.previewWeekHeading} {weekNumber}
            </span>
            <span className="text-[12px]" style={{ color: '#64748B' }}>
              {format(weekStart, 'd. MMM', { locale: dateLocale })} –{' '}
              {format(addDays(weekStart, 4), 'd. MMM', { locale: dateLocale })} · {org.name}
            </span>
          </div>
        </div>

        <p className="text-[14px] leading-relaxed" style={{ color: '#1E293B' }}>
          {resolvedIntro}
        </p>

        {/* Team grid */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #E2E8F0' }}
        >
          <div
            className="grid text-[11px] font-semibold uppercase tracking-[0.12em] px-3 py-2"
            style={{
              gridTemplateColumns: '1.6fr repeat(5, 1fr)',
              background: '#F8FAFC',
              color: '#475569',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <span>{t.settings.email.previewSummary}</span>
            {days.map((d) => (
              <span key={d.toISOString()} className="text-center">
                {format(d, 'EEE d', { locale: dateLocale })}
              </span>
            ))}
          </div>
          {visibleMembers.length === 0 ? (
            <div className="px-3 py-4 text-[13px] text-center" style={{ color: '#64748B' }}>
              {t.settings.email.previewNoMembers}
            </div>
          ) : (
            visibleMembers.map((m, idx) => (
              <div
                key={m.id}
                className="grid items-center px-3 py-2 text-[12.5px]"
                style={{
                  gridTemplateColumns: '1.6fr repeat(5, 1fr)',
                  background: idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC',
                  borderTop: idx === 0 ? 'none' : '1px solid #F1F5F9',
                  color: '#1E293B',
                }}
              >
                <span className="font-medium truncate">{m.display_name}</span>
                {days.map((d) => {
                  const key = `${m.id}_${format(d, 'yyyy-MM-dd')}`
                  const e = byMemberDate.get(key)
                  return (
                    <span key={key} className="flex justify-center">
                      <StatusPill status={e?.status ?? null} label={e?.location_label ?? null} palette={palette} />
                    </span>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 pt-2">
          <span
            className="text-[10.5px] font-semibold uppercase tracking-[0.12em] mr-1"
            style={{ color: '#64748B' }}
          >
            {t.settings.email.previewLegend}:
          </span>
          {STATUSES.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px]"
              style={{
                background: '#F8FAFC',
                color: '#1E293B',
                border: '1px solid #E2E8F0',
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: palette[s] }}
              />
              {t.status[s]}
            </span>
          ))}
        </div>

        <p className="text-[12px] pt-2" style={{ color: '#64748B' }}>
          {t.settings.email.previewFooter.replace(
            '{inboundEmail}',
            org.inbound_email ?? '—'
          )}
        </p>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11.5px] mt-1"
          style={{
            background: '#F1F5F9',
            color: '#475569',
            border: '1px solid #E2E8F0',
          }}
        >
          <Send className="w-3 h-3" strokeWidth={1.75} />
          <span>
            {recipientList.length > 0
              ? `${recipientList.length} mottaker${recipientList.length === 1 ? '' : 'e'}`
              : '—'}
          </span>
          <span style={{ color: '#94A3B8' }}>·</span>
          <Mail className="w-3 h-3" strokeWidth={1.75} />
          <span>{org.timezone}</span>
        </div>
      </div>
    </div>
  )
}

function StatusPill({
  status,
  label,
  palette,
}: {
  status: EntryStatus | null
  label: string | null
  palette: ReturnType<typeof mergeHexColors>
}) {
  if (!status) {
    return (
      <span
        className="inline-block w-5 h-5 rounded-md"
        style={{ background: '#F1F5F9', border: '1px dashed #CBD5E1' }}
      />
    )
  }
  const color = palette[status]
  return (
    <span
      title={label ?? status}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold uppercase tracking-[0.06em]"
      style={{
        background: color,
        color: '#FFFFFF',
        textShadow: '0 1px 1px rgba(0,0,0,0.18)',
        minWidth: 28,
        justifyContent: 'center',
      }}
    >
      {status.slice(0, 3)}
    </span>
  )
}

// =====================================================================
// Tiny shared atoms — radio rows + field shell
// =====================================================================

function Field({
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
        className="text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </label>
      {description && (
        <p
          className="text-[12px] -mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  )
}

function RadioRow({
  checked,
  onClick,
  label,
  hint,
}: {
  checked: boolean
  onClick: () => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-[background,border-color] duration-150"
      style={{
        background: checked
          ? 'color-mix(in oklab, var(--accent-color) 10%, transparent)'
          : 'var(--bg-subtle)',
        border: `1px solid ${
          checked
            ? 'color-mix(in oklab, var(--accent-color) 45%, transparent)'
            : 'var(--border-subtle)'
        }`,
        fontFamily: 'var(--font-body)',
      }}
    >
      <span
        aria-hidden
        className="mt-1 inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: 14,
          height: 14,
          background: checked ? 'var(--accent-color)' : 'transparent',
          boxShadow: checked
            ? '0 0 0 3px color-mix(in oklab, var(--accent-color) 18%, transparent)'
            : 'inset 0 0 0 1.5px var(--border-subtle)',
        }}
      >
        {checked && (
          <span
            className="rounded-full"
            style={{ width: 5, height: 5, background: '#ffffff' }}
          />
        )}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        {hint && (
          <span className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}
