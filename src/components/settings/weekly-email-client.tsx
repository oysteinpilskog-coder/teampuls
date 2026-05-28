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
import { StatusIcon } from '@/components/icons/status-icons'
import { addDays, format, type Locale as DateFnsLocale } from 'date-fns'
import { nb, enGB, sv, es, lt as ltLocale } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/context'
import type { Dictionary, Locale } from '@/lib/i18n/types'
import { LOCALE_META, LOCALES } from '@/lib/i18n/types'
import { resolveMemberLocale, dictForLocale } from '@/lib/i18n/member-locale'
import type { Organization, Member, EntryStatus } from '@/lib/supabase/types'
import { getHolidayFromMap, isSupportedCountry, type HolidayMap } from '@/lib/holidays'
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
  'id' | 'display_name' | 'email' | 'role' | 'is_active' | 'home_office_id' | 'preferred_locale'
>

type SlimOffice = {
  id: string
  name: string
  country_code: string | null
}

interface Props {
  org: Organization
  members: SlimMember[]
  offices: SlimOffice[]
  sampleEntries: SampleEntry[]
  sampleWeekNumber: number
  sampleWeekStartIso: string
  currentUserEmail: string
  /** Server-precomputed holiday map. Lets oppslag av helligdager bruke
   *  en flat lookup-tabell — `date-holidays` (+ moment, ~1.6 MB) holdes
   *  utenfor klient-bundlen. */
  holidays?: HolidayMap
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
  offices,
  sampleEntries,
  sampleWeekNumber,
  sampleWeekStartIso,
  currentUserEmail,
  holidays,
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

  // Hvilken språkversjon av preview-en admin ser akkurat nå.
  // Default = admin sin egen UI-locale, men hen kan bla mellom alle 5
  // for å se hvordan svensk/litauisk osv. ser ut.
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale)


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
    const holiday = getHolidayFromMap(holidays, configuredSendDate, country)
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
      const probeHoliday = getHolidayFromMap(holidays, probe, country)
      if (!isWeekend && !probeHoliday && probe >= configuredSendDate) {
        return { date: probe, willSkip: false, holiday: holiday.name }
      }
    }
    return { date: configuredSendDate, willSkip: true, holiday: holiday.name }
  }, [configuredSendDate, sampleWeekStart, country, holidayStrategy, holidays])

  // recipientList = den faktiske mottaker-listen som senderen vil iterere
  // over. Hver oppføring bærer sin egen `locale` slik at senderen kan
  // velge riktig språkpakke per mottaker (Vilnius → litauisk osv.).
  // Custom-mottakere arver org sin default-locale siden vi ikke vet
  // hvem de er.
  const recipientList = useMemo(() => {
    if (recipients === 'admins_only') {
      return members
        .filter((m) => m.role === 'admin' && m.email)
        .map((m) => ({
          name: m.display_name,
          email: m.email,
          locale: resolveMemberLocale(m, offices, initialOrg),
        }))
    }
    if (recipients === 'custom') {
      const fallback = resolveMemberLocale({}, offices, initialOrg)
      return customRecipientsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((email) => ({ name: email.split('@')[0], email, locale: fallback }))
    }
    return members
      .filter((m) => m.email)
      .map((m) => ({
        name: m.display_name,
        email: m.email,
        locale: resolveMemberLocale(m, offices, initialOrg),
      }))
  }, [recipients, members, customRecipientsText, offices, initialOrg])

  // Språkfordeling over `recipientList`. Vises som pille-rad over
  // preview-en så admin med en gang ser at "5 svensk · 3 engelsk · …"
  // matcher landsfordelingen i kontorene.
  const localeDistribution = useMemo(() => {
    const counts = new Map<Locale, number>()
    for (const r of recipientList) {
      counts.set(r.locale, (counts.get(r.locale) ?? 0) + 1)
    }
    return counts
  }, [recipientList])

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
      {/* Premium hero — Fraunces, lett italic på siste ord, Nordlys-horisont */}
      <div className="mb-10 flex flex-col gap-3">
        <span
          className="text-[10.5px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.settings.title}
        </span>
        <h1
          className="calwin-bar leading-[1.0]"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 300,
            fontSize: 'clamp(36px, 5vw, 48px)',
            letterSpacing: '-0.028em',
            fontFeatureSettings: '"ss01"',
          }}
        >
          {t.settings.email.title}
        </h1>
        <p
          className="text-[15px] max-w-xl"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            letterSpacing: '-0.005em',
          }}
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

        {/* Schedule resolution banner — premium glass-card med subtil
            ember-glow når neste sending er bekreftet, varm warning når
            helligdag er oppdaget. */}
        <div
          className="rounded-2xl px-6 py-5 flex items-start gap-4"
          style={{
            background: resolvedSend.willSkip
              ? 'color-mix(in oklab, var(--warning) 8%, var(--bg-elevated))'
              : resolvedSend.holiday
                ? 'color-mix(in oklab, var(--warning) 5%, var(--bg-elevated))'
                : 'var(--bg-elevated)',
            border: `1px solid ${
              resolvedSend.holiday
                ? 'color-mix(in oklab, var(--warning) 30%, transparent)'
                : 'var(--border-subtle)'
            }`,
            boxShadow: resolvedSend.holiday
              ? '0 1px 0 rgba(255,255,255,0.5) inset, 0 12px 28px -16px color-mix(in oklab, var(--warning) 60%, transparent)'
              : '0 1px 0 rgba(255,255,255,0.5) inset, 0 8px 24px -16px rgba(14,11,8,0.12)',
          }}
        >
          <div
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: resolvedSend.holiday
                ? 'color-mix(in oklab, var(--warning) 18%, var(--bg-subtle))'
                : 'color-mix(in oklab, var(--accent-color) 14%, var(--bg-subtle))',
              border: `1px solid ${
                resolvedSend.holiday
                  ? 'color-mix(in oklab, var(--warning) 35%, transparent)'
                  : 'color-mix(in oklab, var(--accent-color) 30%, transparent)'
              }`,
            }}
          >
            {resolvedSend.holiday ? (
              <AlertTriangle
                className="w-4 h-4"
                strokeWidth={1.75}
                style={{ color: 'var(--warning)' }}
              />
            ) : (
              <Calendar
                className="w-4 h-4"
                strokeWidth={1.75}
                style={{ color: 'var(--accent-color)' }}
              />
            )}
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span
              className="text-[10.5px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              {t.settings.email.previewSendNote}
            </span>
            <span
              className="text-[17px] leading-snug"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-fraunces)',
                fontWeight: 300,
                letterSpacing: '-0.018em',
              }}
            >
              {resolvedSend.willSkip
                ? t.settings.email.previewWillSkip
                : t.settings.email.previewWillSendOn
                    .replace('{date}', sendDateLabel)
                    .replace('{time}', timeStr)}
            </span>
            {resolvedSend.holiday && (
              <span
                className="text-[12.5px] italic mt-0.5"
                style={{
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-fraunces)',
                  fontVariationSettings: '"opsz" 14, "SOFT" 40',
                }}
              >
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

          {/* Språkfordeling — viser umiddelbart at en SE-mottaker får svensk
              mail, en LT-mottaker litauisk osv. */}
          {localeDistribution.size > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.16em] mr-1"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {t.settings.email.languageDistribution}
              </span>
              {LOCALES.filter((l) => (localeDistribution.get(l) ?? 0) > 0).map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px]"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span aria-hidden>{LOCALE_META[l].flag}</span>
                  <span>{LOCALE_META[l].nativeName}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {localeDistribution.get(l)}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Språk-velger for selve preview-renderingen */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.16em] mr-1"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t.settings.email.previewAsLanguage}
            </span>
            {LOCALES.map((l) => {
              const active = previewLocale === l
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setPreviewLocale(l)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-[background,border-color] duration-150"
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
                  <span aria-hidden>{LOCALE_META[l].flag}</span>
                  <span>{LOCALE_META[l].nativeName}</span>
                </button>
              )
            })}
          </div>

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
            previewLocale={previewLocale}
            uiDict={t}
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
  previewLocale,
  uiDict,
  dateLocale,
}: {
  org: Organization
  members: SlimMember[]
  entries: SampleEntry[]
  weekNumber: number
  weekStart: Date
  recipientList: { name: string; email: string; locale: Locale }[]
  subject: string
  intro: string
  palette: ReturnType<typeof mergeHexColors>
  currentUserEmail: string
  previewLocale: Locale
  uiDict: Dictionary
  dateLocale: DateFnsLocale
}) {
  // Mailen render-er på `previewLocale`. Både dictionary og date-fns-
  // locale følger med så datoformatet ("Mon 4" vs "ma 4") matcher
  // mottakerens språk i preview-en. `uiDict` (admin sin UI-locale)
  // er bare med for at toast-er o.l. utenfor selve mailen.
  void uiDict
  const previewDict = dictForLocale(previewLocale)
  const dateFnsLocaleMap: Record<Locale, DateFnsLocale> = {
    no: nb,
    en: enGB,
    sv: sv,
    es: es,
    lt: ltLocale,
  }
  const localeForDates: DateFnsLocale = dateFnsLocaleMap[previewLocale] ?? dateLocale

  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))

  // Standard-emne i hver av de fem språkene — brukes når admin lar feltet
  // stå tomt. Default-tekst er ikke i Dictionary-strukturen siden den er
  // template-basert.
  const DEFAULT_SUBJECTS: Record<Locale, string> = {
    no: `Ukens plan — ${org.name}`,
    en: `Plan for the week — ${org.name}`,
    sv: `Veckans plan — ${org.name}`,
    es: `Plan semanal — ${org.name}`,
    lt: `Savaitės planas — ${org.name}`,
  }
  const DEFAULT_INTRO: Record<Locale, string> = {
    no: 'Hei alle sammen! Her er ukens oversikt — gi beskjed hvis noe må justeres.',
    en: "Hi everyone! Here's the plan for the week — let me know if anything needs adjusting.",
    sv: 'Hej alla! Här är veckans översikt — säg till om något ska justeras.',
    es: '¡Hola a todos! Aquí está el plan de la semana — avísame si hay que ajustar algo.',
    lt: 'Sveiki visi! Štai šios savaitės apžvalga — praneškite, jei reikia ką nors koreguoti.',
  }

  const resolvedSubject = (subject.trim() || DEFAULT_SUBJECTS[previewLocale])
    .replace(/\{orgName\}/g, org.name)
    .replace(/\{weekNumber\}/g, String(weekNumber))

  const resolvedIntro = intro.trim() || DEFAULT_INTRO[previewLocale]

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

  // Statuser som rent faktisk dukker opp denne uka — vi viser bare disse i
  // forklaringen, ikke alle 8. Det reduserer støy og gir mer luft.
  const usedStatuses = new Set<EntryStatus>()
  for (const e of entries) usedStatuses.add(e.status)
  const legendStatuses: EntryStatus[] = (
    ['office', 'remote', 'customer', 'event', 'travel', 'vacation', 'absent', 'off'] as const
  ).filter((s) => usedStatuses.has(s))

  // Premium paper-tone — varmt, ikke kalt hvitt. Speiler design-systemets
  // `--paper`-token, men hardkodet siden e-post-render-en må være
  // theme-uavhengig (en mottaker leser den i sin egen mailklient).
  const PAPER = '#F7F2E8'
  const INK = '#0E0B08'
  const MIST = '#8A7F70'
  const HAIRLINE = 'rgba(14, 11, 8, 0.07)'

  return (
    <div
      className="rounded-[28px] overflow-hidden"
      style={{
        background: PAPER,
        border: '1px solid rgba(14,11,8,0.06)',
        color: INK,
        fontFamily: 'var(--font-body)',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 60px -30px rgba(14,11,8,0.18), 0 8px 24px -12px rgba(14,11,8,0.08)',
      }}
    >
      {/* Mail-klient header — diskret, så det er tydelig at dette ER en mail
          uten å stjele oppmerksomhet fra selve innholdet. */}
      <div
        className="px-6 py-3 flex items-center gap-3 text-[11px]"
        style={{
          borderBottom: `1px solid ${HAIRLINE}`,
          color: MIST,
          background: 'rgba(14,11,8,0.015)',
        }}
      >
        <span
          className="font-semibold uppercase tracking-[0.18em] text-[9.5px]"
          style={{ color: MIST }}
        >
          {previewDict.settings.email.previewFromLabel}
        </span>
        <span style={{ color: INK, fontWeight: 500 }} className="truncate">
          {fromName}
        </span>
        <span style={{ color: MIST }}>·</span>
        <span
          className="font-semibold uppercase tracking-[0.18em] text-[9.5px]"
          style={{ color: MIST }}
        >
          {previewDict.settings.email.previewToLabel}
        </span>
        <span style={{ color: INK, fontWeight: 500 }} className="truncate">
          {recipientPreviewLine || currentUserEmail}
        </span>
      </div>

      {/* HERO — store moment. Logo + uke-nummer + datointervall.
          Nordlys-horisont under tittelen er den ene "én gang per skjerm"-
          signaturen. Tallet er Fraunces, italic — Ember-fargen. */}
      <div className="px-10 pt-12 pb-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logo_url}
                alt={org.name}
                className="w-9 h-9 rounded-xl object-contain"
                style={{ background: 'transparent' }}
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-bold"
                style={{
                  background: (() => {
                    const c = org.accent_color ?? org.primary_color ?? '#0066FF'
                    return `linear-gradient(135deg, ${c} 0%, color-mix(in oklab, ${c} 65%, #000) 100%)`
                  })(),
                  color: '#fff',
                  fontFamily: 'var(--font-fraunces)',
                }}
              >
                {org.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span
              className="text-[14px]"
              style={{
                color: INK,
                fontWeight: 500,
                letterSpacing: '-0.01em',
              }}
            >
              {org.name}
            </span>
          </div>
          <span
            className="text-[10.5px] font-semibold uppercase tracking-[0.18em] tabular-nums"
            style={{ color: MIST }}
          >
            {format(weekStart, 'MMM yyyy', { locale: localeForDates })}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <h1
            className="leading-[0.92]"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontWeight: 300,
              fontSize: 'clamp(56px, 9vw, 96px)',
              letterSpacing: '-0.045em',
              color: INK,
              fontFeatureSettings: '"ss01"',
            }}
          >
            {previewDict.settings.email.previewWeekHeading}{' '}
            <em
              style={{
                fontStyle: 'italic',
                color: '#B45309',
                fontVariationSettings: '"opsz" 144, "SOFT" 80',
              }}
            >
              {weekNumber}
            </em>
          </h1>

          {/* Nordlys-horisont — én gang per skjerm */}
          <span
            aria-hidden
            className="block rounded-full"
            style={{
              width: 56,
              height: 2,
              // CalWin-paletten via tokens. NB: dette er settings-preview;
              // selve sendt e-post bygges separat (egen template) der
              // CSS-variabler ikke fungerer — der må vi bruke literal hex.
              background:
                'linear-gradient(90deg, var(--nordlys-a) 0%, var(--nordlys-b) 55%, var(--nordlys-c) 100%)',
              boxShadow: '0 0 12px color-mix(in oklab, var(--nordlys-b) 35%, transparent)',
            }}
          />

          <p
            className="text-[16px]"
            style={{
              color: MIST,
              fontWeight: 400,
              letterSpacing: '-0.005em',
            }}
          >
            {format(weekStart, 'd. MMMM', { locale: localeForDates })} –{' '}
            {format(addDays(weekStart, 4), 'd. MMMM', { locale: localeForDates })}
          </p>
        </div>
      </div>

      {/* Intro — Fraunces lede-størrelse, gir mailen menneskelig stemme */}
      <div className="px-10 pb-10">
        <p
          className="leading-[1.45]"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 300,
            fontSize: 'clamp(18px, 2vw, 22px)',
            letterSpacing: '-0.012em',
            color: INK,
          }}
        >
          {resolvedIntro}
        </p>
      </div>

      {/* Team — hver person som en horisontal flow, ingen tabell-celler.
          Den fulle bredden brukes så hver dag får luft. */}
      <div className="px-10 pb-12 flex flex-col">
        {visibleMembers.length === 0 ? (
          <p
            className="text-[14px] py-6 text-center italic"
            style={{ color: MIST, fontFamily: 'var(--font-fraunces)' }}
          >
            {previewDict.settings.email.previewNoMembers}
          </p>
        ) : (
          visibleMembers.map((m, idx) => {
            const memberDays = days.map((d) => {
              const key = `${m.id}_${format(d, 'yyyy-MM-dd')}`
              return { date: d, entry: byMemberDate.get(key) ?? null }
            })
            const noteForRow = memberDays.find((d) => d.entry?.location_label)
              ?.entry?.location_label

            return (
              <div
                key={m.id}
                className="py-5 grid gap-4 items-center"
                style={{
                  gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 3fr)',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIRLINE}`,
                }}
              >
                {/* Navn + valgfri location-note som italic eyebrow */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className="text-[18px] truncate"
                    style={{
                      color: INK,
                      fontWeight: 500,
                      letterSpacing: '-0.018em',
                    }}
                  >
                    {m.display_name}
                  </span>
                  {noteForRow && (
                    <span
                      className="text-[12.5px] truncate italic"
                      style={{
                        color: MIST,
                        fontFamily: 'var(--font-fraunces)',
                        fontVariationSettings: '"opsz" 14, "SOFT" 40',
                      }}
                    >
                      {noteForRow}
                    </span>
                  )}
                </div>

                {/* 5 dager som premium kapseler — ingen rammeboks rundt */}
                <div className="flex items-stretch gap-2 min-w-0">
                  {memberDays.map(({ date, entry }) => (
                    <DayCapsule
                      key={date.toISOString()}
                      date={date}
                      status={entry?.status ?? null}
                      palette={palette}
                      dateLocale={localeForDates}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Forklaring — kun statusene som faktisk er i bruk denne uka.
          Subtil, ikke en boks, bare en linje med farge-prikker. */}
      {legendStatuses.length > 0 && (
        <div
          className="px-10 py-6 flex flex-wrap gap-x-4 gap-y-2"
          style={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          {legendStatuses.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-2 text-[12px]"
              style={{ color: MIST }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{
                  background: palette[s],
                  boxShadow: `0 0 6px ${palette[s]}66`,
                }}
              />
              {previewDict.status[s]}
            </span>
          ))}
        </div>
      )}

      {/* Footer — minimal, italic accent på inbound-mailen */}
      <div
        className="px-10 py-8 flex flex-col gap-3"
        style={{ borderTop: `1px solid ${HAIRLINE}` }}
      >
        <p
          className="text-[14px] leading-relaxed"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 300,
            color: INK,
            fontVariationSettings: '"opsz" 18, "SOFT" 60',
          }}
        >
          {previewDict.settings.email.previewFooter
            .replace('{inboundEmail}', '')
            .trim()
            .replace(/\.$/, '')}
        </p>
        <a
          className="text-[15px] inline-flex items-center gap-2 self-start italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: '#B45309',
            textDecoration: 'none',
            borderBottom: '1px solid rgba(180,83,9,0.35)',
            paddingBottom: 1,
          }}
          href={`mailto:${org.inbound_email ?? ''}`}
        >
          {org.inbound_email ?? '—'}
        </a>
      </div>

      {/* TeamPulse-signet helt nederst — diskret, paper bg-glow */}
      <div
        className="px-10 py-5 flex items-center justify-between text-[10.5px] uppercase tracking-[0.2em]"
        style={{
          color: MIST,
          background: 'rgba(14,11,8,0.025)',
          borderTop: `1px solid ${HAIRLINE}`,
          fontWeight: 500,
        }}
      >
        <span>TeamPulse</span>
        <span className="tabular-nums">{org.timezone}</span>
      </div>
    </div>
  )
}

/**
 * En "dag-kapsel" — den minste byggeklossen i den nye preview-en.
 *
 * Top: ukedag + dato (eyebrow / mono-feel via Manrope tracking)
 * Bunn: subtil bakgrunn matchende statusen + ikon + label
 *
 * Ingen status → bare en blass paper-flate. Det er bevisst — vi vil ikke
 * pepre mailen med "ikke registrert"-merker.
 */
function DayCapsule({
  date,
  status,
  palette,
  dateLocale,
}: {
  date: Date
  status: EntryStatus | null
  palette: ReturnType<typeof mergeHexColors>
  dateLocale: DateFnsLocale
}) {
  const weekday = format(date, 'EEE', { locale: dateLocale })
  const day = format(date, 'd', { locale: dateLocale })

  if (!status) {
    return (
      <div
        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 rounded-2xl py-3"
        style={{
          background: 'rgba(14,11,8,0.025)',
          color: '#8A7F70',
          minHeight: 64,
        }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.16em] font-semibold"
          style={{ opacity: 0.7 }}
        >
          {weekday}
        </span>
        <span
          className="text-[18px] tabular-nums"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 300,
            opacity: 0.55,
          }}
        >
          {day}
        </span>
      </div>
    )
  }

  const color = palette[status]
  return (
    <div
      className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 rounded-2xl py-3 relative overflow-hidden"
      style={{
        background: `linear-gradient(155deg, ${color} 0%, color-mix(in oklab, ${color} 78%, #000) 100%)`,
        color: '#FFFFFF',
        minHeight: 64,
        boxShadow: `0 6px 18px -10px ${color}99, inset 0 1px 0 rgba(255,255,255,0.18)`,
      }}
    >
      {/* Subtil glans øverst */}
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: '40%',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 70%, transparent 100%)',
        }}
      />
      <span
        className="text-[10px] uppercase tracking-[0.16em] font-semibold"
        style={{ opacity: 0.85, textShadow: '0 1px 1px rgba(0,0,0,0.18)' }}
      >
        {weekday}
      </span>
      <div className="flex items-center gap-1.5">
        <StatusIcon status={status} size={11} color="#FFFFFF" />
        <span
          className="text-[16px] tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 300,
            textShadow: '0 1px 1px rgba(0,0,0,0.16)',
          }}
        >
          {day}
        </span>
      </div>
    </div>
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
