'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Pencil, X, Trash2, AlertTriangle, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Member, MemberRole, Office, WorkspaceSummary } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { MemberAvatar } from '@/components/member-avatar'
import { EmptyState } from '@/components/empty-state'
import { DatePicker } from '@/components/date-picker'
import { CountryCombobox } from '@/components/ui/country-combobox'
import { WorkspaceBadge } from '@/components/workspace-badge'
import { flagFor, isSupportedCountry } from '@/lib/holidays'
import { useT } from '@/lib/i18n/context'

interface MembersClientProps {
  orgId: string
  /** Aktive org-ids: ett element i single-mode, alle i «Alle CalWin». */
  orgIds: string[]
  workspaces: WorkspaceSummary[]
  /** True når «Alle CalWin» er aktivt — tegner per-rad workspace-badge
   *  og lar admin velge arbeidsområde i Legg-til-modalen. */
  combinedView: boolean
  currentMemberId: string
  initialMembers: Member[]
  initialOffices: Office[]
}

interface MemberFormState {
  display_name: string
  full_name: string
  initials: string
  email: string
  role: MemberRole
  // ISO 3166-1 alpha-2. Tom string = ingen overstyring (faller tilbake til
  // e-postdomene-backfill i migration 018). Lagres ikke direkte — løses
  // til home_office_id ved save.
  country_code: string
  // Eksplisitt lokasjon for lokasjon-badgen. 'GB' = UK, 'NO' = resten.
  location_code: 'NO' | 'GB'
  birth_date: string
  birthday_visible: boolean
  start_date: string
  anniversary_visible: boolean
  hidden_from_overview: boolean
  /** I combined-view velger admin hvilket arbeidsområde det nye medlemmet
   *  skal opprettes i. I single-mode er feltet uvirksomt (alltid `orgId`). */
  target_org_id: string
}

function emptyForm(defaultOrgId: string): MemberFormState {
  return {
    display_name: '',
    full_name: '',
    initials: '',
    email: '',
    role: 'member',
    country_code: '',
    location_code: 'NO',
    birth_date: '',
    birthday_visible: false,
    start_date: '',
    anniversary_visible: true,
    hidden_from_overview: false,
    target_org_id: defaultOrgId,
  }
}

const COUNTRY_FAVORITES = ['NO', 'SE', 'LT', 'GB'] as const

export function MembersClient({
  orgId,
  orgIds,
  workspaces,
  combinedView,
  currentMemberId,
  initialMembers,
  initialOffices,
}: MembersClientProps) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [offices] = useState<Office[]>(initialOffices)
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed')
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [form, setForm] = useState<MemberFormState>(() => emptyForm(orgId))
  const [initialsTouched, setInitialsTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)
  const t = useT()

  const workspaceById = new Map(workspaces.map(w => [w.org_id, w]))
  const targetWorkspaces = workspaces.filter(w => orgIds.includes(w.org_id))

  function countryCodeFor(officeId: string | null | undefined): string {
    if (!officeId) return ''
    return offices.find(o => o.id === officeId)?.country_code ?? ''
  }

  /** I combined-view begrenses kontor-kandidater til medlemmets eget org,
   *  så vi ikke kobler en UK-ansatt til et Nordic-kontor ved et uhell. */
  function resolveOfficeId(countryCode: string, scopeOrgId: string): string | null | { error: true } {
    if (!countryCode) return null
    const match = offices.find(o => o.country_code === countryCode && o.org_id === scopeOrgId)
    if (!match) return { error: true }
    return match.id
  }

  const ROLE_LABELS: Record<MemberRole, string> = {
    admin: t.settings.members.roleAdmin,
    member: t.settings.members.roleMember,
  }

  function openAdd() {
    setForm(emptyForm(orgId))
    setInitialsTouched(false)
    setEditTarget(null)
    setModalMode('add')
  }

  function openEdit(m: Member) {
    setForm({
      display_name: m.display_name,
      full_name: m.full_name ?? '',
      initials: m.initials ?? '',
      email: m.email,
      role: m.role,
      country_code: countryCodeFor(m.home_office_id),
      location_code: m.location_code ?? 'NO',
      birth_date: m.birth_date ?? '',
      birthday_visible: m.birthday_visible ?? false,
      start_date: m.start_date ?? '',
      anniversary_visible: m.anniversary_visible ?? true,
      hidden_from_overview: m.hidden_from_overview ?? false,
      target_org_id: m.org_id,
    })
    setInitialsTouched(true)
    setEditTarget(m)
    setModalMode('edit')
  }

  function closeModal() { setModalMode('closed') }

  async function handleSave() {
    if (!form.display_name.trim() || !form.email.trim() || saving) return

    // I edit-modus følger vi medlemmets eget org_id (kontorer kobles per
    // arbeidsområde). I add-modus ble target_org_id valgt i modalen.
    const scopeOrgId = modalMode === 'edit' && editTarget ? editTarget.org_id : form.target_org_id

    const officeIdResult = resolveOfficeId(form.country_code, scopeOrgId)
    if (officeIdResult && typeof officeIdResult === 'object' && 'error' in officeIdResult) {
      toast.error(t.settings.members.errorNoOfficeForCountry)
      return
    }
    const home_office_id = officeIdResult as string | null

    setSaving(true)
    const supabase = createClient()

    const initials = form.initials.trim().toUpperCase() || null
    const full_name = form.full_name.trim() || null

    const baseFields = {
      display_name: form.display_name.trim(),
      full_name,
      initials,
      email: form.email.trim().toLowerCase(),
      role: form.role,
      home_office_id,
      location_code: form.location_code,
      birth_date: form.birth_date || null,
      birthday_visible: form.birthday_visible,
      start_date: form.start_date || null,
      anniversary_visible: form.anniversary_visible,
      hidden_from_overview: form.hidden_from_overview,
    }

    if (modalMode === 'edit' && editTarget) {
      // Optimistic edit — paint the new values immediately and close the
      // modal. The DB write races behind; on failure we restore the prior
      // row from the snapshot we captured before mutating.
      const snapshot = editTarget
      setMembers(prev => prev.map(m => m.id === editTarget.id ? { ...m, ...baseFields } : m))
      closeModal()
      toast.success(t.settings.members.toastSaved)

      const { error } = await supabase
        .from('members')
        .update(baseFields)
        .eq('id', editTarget.id)
      setSaving(false)
      if (error) {
        // Roll back the optimistic patch
        setMembers(prev => prev.map(m => m.id === snapshot.id ? snapshot : m))
        toast.error(describeSaveError(error, t.settings.members.errorEmailTaken))
      }
    } else {
      // Optimistic add — synthesize a placeholder row keyed with a temp id
      // so the table renders the new member the same frame the user clicks
      // Save. When the insert returns, swap the placeholder for the canonical
      // server row so subsequent edits reference the real id. On failure,
      // remove the placeholder.
      const tempId = `optimistic-${Date.now()}`
      const placeholder = {
        ...baseFields,
        id: tempId,
        org_id: scopeOrgId,
        is_active: true,
        nicknames: [] as string[],
      } as Member
      setMembers(prev => [...prev, placeholder].sort((a, b) => a.display_name.localeCompare(b.display_name)))
      closeModal()
      toast.success(`${baseFields.display_name} ${t.settings.members.toastAddedSuffix}`)

      const { data, error } = await supabase
        .from('members')
        .insert({ ...baseFields, org_id: scopeOrgId, is_active: true, nicknames: [] })
        .select()
        .single()
      setSaving(false)
      if (error) {
        setMembers(prev => prev.filter(m => m.id !== tempId))
        toast.error(describeSaveError(error, t.settings.members.errorEmailTaken))
        return
      }
      // Replace the placeholder with the canonical row (in case realtime
      // also delivers it, the dedupe-by-id in the realtime handler keeps
      // the list clean).
      setMembers(prev => prev
        .map(m => m.id === tempId ? (data as Member) : m)
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
      )
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    if (deleteTarget.id === currentMemberId) {
      toast.error(t.settings.members.errorCannotDeleteSelf)
      return
    }
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('members').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { toast.error(t.settings.members.errorDeleteMember); return }
    setMembers(prev => prev.filter(x => x.id !== deleteTarget.id))
    toast.success(`${deleteTarget.display_name} ${t.settings.members.toastDeletedSuffix}`)
    setDeleteTarget(null)
  }

  async function toggleActive(m: Member) {
    if (m.id === currentMemberId) {
      toast.error(t.settings.members.errorCannotDeactivateSelf)
      return
    }
    const supabase = createClient()
    const { error } = await supabase
      .from('members')
      .update({ is_active: !m.is_active })
      .eq('id', m.id)
    if (error) { toast.error(t.common.errorShort); return }
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, is_active: !x.is_active } : x))
    toast.success(m.is_active ? `${m.display_name} ${t.settings.members.toastDeactivatedSuffix}` : `${m.display_name} ${t.settings.members.toastActivatedSuffix}`)
  }

  const active = members.filter(m => m.is_active)
  const inactive = members.filter(m => !m.is_active)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="calwin-bar text-[24px] font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
          >
            {t.settings.members.title}
          </h1>
          <p className="text-[14px] mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {active.length} aktive · {inactive.length} inaktive
            {combinedView && targetWorkspaces.length > 1 && (
              <> · {targetWorkspaces.length} arbeidsområder</>
            )}
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

      {/* Active members */}
      {active.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" strokeWidth={1.5} />}
          title={t.settings.members.empty}
          description={t.settings.members.emptyHint}
        />
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
        >
          {active.map((m, i) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.id === currentMemberId}
              isLast={i === active.length - 1}
              roleLabel={ROLE_LABELS[m.role]}
              countryCode={countryCodeFor(m.home_office_id)}
              workspace={combinedView ? workspaceById.get(m.org_id) ?? null : null}
              onEdit={() => openEdit(m)}
              onToggle={() => toggleActive(m)}
              onDelete={() => setDeleteTarget(m)}
            />
          ))}
        </div>
      )}

      {/* Inactive members */}
      {inactive.length > 0 && (
        <div className="mt-6">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.16em] px-1 mb-2"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {t.settings.members.inactiveTitle}
          </p>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
          >
            {inactive.map((m, i) => (
              <MemberRow
                key={m.id}
                member={m}
                isSelf={false}
                isLast={i === inactive.length - 1}
                roleLabel={ROLE_LABELS[m.role]}
                countryCode={countryCodeFor(m.home_office_id)}
                workspace={combinedView ? workspaceById.get(m.org_id) ?? null : null}
                onEdit={() => openEdit(m)}
                onToggle={() => toggleActive(m)}
                onDelete={() => setDeleteTarget(m)}
              />
            ))}
          </div>
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
              className="tp-modal pointer-events-auto w-[440px] max-w-full max-h-[calc(100vh-10vh-1rem)] sm:max-h-[calc(100vh-12vh-2rem)] overflow-y-auto rounded-2xl p-4 sm:p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-[20px] font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
                >
                  {modalMode === 'add' ? t.settings.members.modalAddTitle : t.settings.members.modalEditTitle}
                </h2>
                <button onClick={closeModal} style={{ color: 'var(--text-tertiary)' }}>
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>

              {/* I «Alle CalWin» velger admin hvilket arbeidsområde det nye
                  medlemmet skal høre til. I edit-modus er feltet skjult — vi
                  flytter ikke et eksisterende medlem mellom workspaces her,
                  det krever en egen migrering. */}
              {combinedView && modalMode === 'add' && targetWorkspaces.length > 1 && (
                <Field label={t.workspace.switcher} hint={t.workspace.combinedDescription}>
                  <div className="flex flex-wrap gap-2">
                    {targetWorkspaces.map(w => {
                      const selected = form.target_org_id === w.org_id
                      const accent = /^#[0-9a-fA-F]{3,8}$/.test(w.accent_color ?? '')
                        ? (w.accent_color as string)
                        : null
                      return (
                        <button
                          key={w.org_id}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, target_org_id: w.org_id }))}
                          className="px-3 py-2 rounded-xl text-[13px] font-medium transition-all"
                          style={{
                            backgroundColor: selected
                              ? accent
                                ? `color-mix(in oklab, ${accent} 14%, transparent)`
                                : 'rgba(0,102,255,0.10)'
                              : 'var(--bg-subtle)',
                            color: selected
                              ? (accent ?? 'var(--accent-color)')
                              : 'var(--text-secondary)',
                            border: `1.5px solid ${
                              selected
                                ? (accent ?? 'var(--accent-color)')
                                : 'transparent'
                            }`,
                            fontFamily: 'var(--font-body)',
                          }}
                        >
                          {w.name}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              )}

              {/* Identity group */}
              <div className="flex flex-col gap-4">
                <Field label={t.common.name} hint="Fornavnet som vises i teamet">
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={e => {
                      const display_name = e.target.value
                      setForm(f => ({
                        ...f,
                        display_name,
                        initials: initialsTouched ? f.initials : deriveInitials(display_name, f.full_name),
                      }))
                    }}
                    placeholder="Ola"
                    className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                  />
                </Field>

                <Field label="Fullt navn" hint="Valgfritt — vises på hover og i oppsummeringer">
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={e => {
                      const full_name = e.target.value
                      setForm(f => ({
                        ...f,
                        full_name,
                        initials: initialsTouched ? f.initials : deriveInitials(f.display_name, full_name),
                      }))
                    }}
                    placeholder="Ola Normann"
                    className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                  />
                </Field>

                <Field label={t.settings.members.emailLabel}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="navn@firma.no"
                    className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                  />
                </Field>

                <Field label={t.settings.members.countryLabel} hint={t.settings.members.countryHint}>
                  <CountryCombobox
                    value={form.country_code}
                    onChange={code => setForm(f => ({ ...f, country_code: code }))}
                    favorites={COUNTRY_FAVORITES}
                    ariaLabel={t.settings.members.countryLabel}
                    placeholder={t.settings.members.countryPlaceholder}
                  />
                </Field>

                <Field label={t.settings.members.locationLabel} hint={t.settings.members.locationHint}>
                  <div className="flex gap-2">
                    {([['NO', 'NO'], ['GB', 'UK']] as const).map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, location_code: code }))}
                        className="flex-1 py-2 rounded-xl text-[13px] font-medium transition-all"
                        style={{
                          backgroundColor: form.location_code === code ? 'rgba(0,102,255,0.1)' : 'var(--bg-subtle)',
                          color: form.location_code === code ? 'var(--accent-color)' : 'var(--text-secondary)',
                          border: `1.5px solid ${form.location_code === code ? 'var(--accent-color)' : 'transparent'}`,
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Divider */}
              <div className="h-px -mx-6" style={{ backgroundColor: 'var(--border-subtle)' }} />

              {/* Role */}
              <Field label="Rolle">
                <div className="flex gap-2">
                  {(['member', 'admin'] as MemberRole[]).map(r => (
                    <button
                      key={r}
                      onClick={() => setForm(f => ({ ...f, role: r }))}
                      className="flex-1 py-2 rounded-xl text-[13px] font-medium transition-all"
                      style={{
                        backgroundColor: form.role === r ? 'rgba(0,102,255,0.1)' : 'var(--bg-subtle)',
                        color: form.role === r ? 'var(--accent-color)' : 'var(--text-secondary)',
                        border: `1.5px solid ${form.role === r ? 'var(--accent-color)' : 'transparent'}`,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Divider */}
              <div className="h-px -mx-6" style={{ backgroundColor: 'var(--border-subtle)' }} />

              {/* Personal — birthday + anniversary */}
              <div className="flex flex-col gap-3">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                >
                  {t.settings.members.personalSection}
                </p>

                <Field label={t.settings.members.birthDateLabel} hint={t.settings.members.birthDateHint}>
                  <DatePicker
                    value={form.birth_date}
                    onChange={d => setForm(f => ({ ...f, birth_date: d }))}
                    placeholder="Velg fødselsdato"
                  />
                </Field>

                <ToggleRow
                  label={t.settings.members.birthdayVisibleLabel}
                  hint={t.settings.members.birthdayVisibleHint}
                  checked={form.birthday_visible}
                  onChange={v => setForm(f => ({ ...f, birthday_visible: v }))}
                  disabled={!form.birth_date}
                />

                <Field label={t.settings.members.startDateLabel} hint={t.settings.members.startDateHint}>
                  <DatePicker
                    value={form.start_date}
                    onChange={d => setForm(f => ({ ...f, start_date: d }))}
                    placeholder="Velg startdato"
                  />
                </Field>

                <ToggleRow
                  label={t.settings.members.anniversaryVisibleLabel}
                  hint={t.settings.members.anniversaryVisibleHint}
                  checked={form.anniversary_visible}
                  onChange={v => setForm(f => ({ ...f, anniversary_visible: v }))}
                  disabled={!form.start_date}
                />

                <ToggleRow
                  label={t.settings.members.hiddenFromOverviewLabel}
                  hint={t.settings.members.hiddenFromOverviewHint}
                  checked={form.hidden_from_overview}
                  onChange={v => setForm(f => ({ ...f, hidden_from_overview: v }))}
                />
              </div>

              {/* AI group */}
              <div
                className="flex flex-col gap-2 p-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-subtle)' }}
              >
                <div className="flex items-baseline gap-2">
                  <label
                    className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                  >
                    AI-kortkode
                  </label>
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                    2 bokstaver for raske referanser — «ON uke 18»
                  </span>
                </div>
                <input
                  type="text"
                  value={form.initials}
                  onChange={e => {
                    setInitialsTouched(true)
                    setForm(f => ({ ...f, initials: e.target.value.slice(0, 3).toUpperCase() }))
                  }}
                  placeholder="ON"
                  maxLength={3}
                  className="w-24 px-3 py-2.5 rounded-xl text-[14px] font-semibold tracking-wider outline-none uppercase"
                  style={{ ...inputStyle, backgroundColor: 'var(--bg-elevated)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                />
              </div>

              {/* Actions */}
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
                  disabled={!form.display_name.trim() || !form.email.trim() || saving}
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

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
              onClick={() => !deleting && setDeleteTarget(null)}
            />
            <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-[10vh] sm:pt-[12vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={spring.modal}
              className="tp-modal pointer-events-auto w-[420px] max-w-full rounded-2xl p-4 sm:p-6 flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(220,38,38,0.1)', color: '#DC2626' }}
                >
                  <AlertTriangle className="w-5 h-5" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <h2
                    className="text-[18px] font-semibold"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
                  >
                    Slett {deleteTarget.display_name}?
                  </h2>
                  <p
                    className="text-[13px] mt-1.5"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                  >
                    Dette sletter medlemmet og alle statusoppføringer permanent. Handlingen kan ikke angres.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-subtle)', fontFamily: 'var(--font-body)' }}
                >
                  {t.common.cancel}
                </button>
                <motion.button
                  onClick={confirmDelete}
                  disabled={deleting}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
                  className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: '#DC2626', fontFamily: 'var(--font-body)' }}
                >
                  {deleting ? 'Sletter...' : 'Slett permanent'}
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

function deriveInitials(displayName: string, fullName: string): string {
  const source = (fullName.trim() || displayName.trim())
  if (!source) return ''
  const words = source.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

type SupabaseError = { code?: string; message?: string }

function describeSaveError(error: SupabaseError, emailTakenMessage: string): string {
  if (error.code === '23505') {
    return error.message?.includes('initials')
      ? 'Initialene er allerede i bruk i teamet.'
      : emailTakenMessage
  }
  if (error.code === '42501' || error.message?.toLowerCase().includes('row-level security')) {
    return 'Du må være admin for å endre medlemmer.'
  }
  return error.message || 'Noe gikk galt. Prøv igjen.'
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-[background,border-color,opacity] duration-150 disabled:cursor-not-allowed"
      style={{
        background: checked ? 'color-mix(in oklab, var(--lg-accent) 10%, transparent)' : 'var(--bg-subtle)',
        border: `1px solid ${checked ? 'color-mix(in oklab, var(--lg-accent) 45%, transparent)' : 'var(--border-subtle)'}`,
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'var(--font-body)',
      }}
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 mt-0.5 rounded-full transition-[background] duration-150"
        style={{
          width: 32,
          height: 18,
          background: checked ? 'var(--accent-color, #0066FF)' : 'rgba(120,120,120,0.25)',
          padding: 2,
        }}
      >
        <span
          className="block rounded-full bg-white transition-transform duration-150"
          style={{
            width: 14,
            height: 14,
            transform: checked ? 'translateX(14px)' : 'translateX(0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          }}
        />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="text-[13px] font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </span>
        {hint && (
          <span
            className="text-[12px]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label
          className="text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          {label}
        </label>
        {hint && (
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function MemberRow({
  member,
  isSelf,
  isLast,
  roleLabel,
  countryCode,
  workspace,
  onEdit,
  onToggle,
  onDelete,
}: {
  member: Member
  isSelf: boolean
  isLast: boolean
  roleLabel: string
  countryCode: string
  /** Vises kun i «Alle CalWin»-vyen som en liten pille per rad. */
  workspace: WorkspaceSummary | null
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const flag = isSupportedCountry(countryCode) ? flagFor(countryCode) : null
  return (
    <div
      className="flex items-center gap-4 px-5 py-4"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
        opacity: member.is_active ? 1 : 0.5,
      }}
    >
      <MemberAvatar
        name={member.display_name}
        initials={member.initials}
        avatarUrl={member.avatar_url}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[14px] font-medium truncate"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            {member.display_name}
          </span>
          {workspace && <WorkspaceBadge workspace={workspace} />}
          {flag && (
            <span
              className="text-[14px] leading-none shrink-0"
              aria-label={`Land: ${countryCode}`}
              title={countryCode}
            >
              {flag}
            </span>
          )}
          {member.initials && (
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-md font-mono"
              style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
              title="Initialer"
            >
              {member.initials}
            </span>
          )}
          {isSelf && (
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: 'rgba(0,102,255,0.1)', color: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
            >
              Deg
            </span>
          )}
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-lg"
            style={{
              backgroundColor: member.role === 'admin' ? 'rgba(139,63,230,0.1)' : 'var(--bg-subtle)',
              color: member.role === 'admin' ? '#8B3FE6' : 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {roleLabel}
          </span>
        </div>
        <p className="text-[12px] truncate" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
          {member.full_name && member.full_name !== member.display_name && (
            <span>{member.full_name} · </span>
          )}
          {member.email}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-subtle)]"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Rediger"
        >
          <Pencil className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onToggle}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-[var(--bg-subtle)]"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          aria-label={member.is_active ? 'Deaktiver' : 'Aktiver'}
        >
          {member.is_active ? 'Deaktiver' : 'Aktiver'}
        </button>
        {!isSelf && (
          <button
            onClick={onDelete}
            className="p-2 rounded-lg transition-colors hover:bg-[rgba(220,38,38,0.1)]"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Slett permanent"
            title="Slett permanent"
            onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  )
}
