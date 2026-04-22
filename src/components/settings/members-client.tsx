'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Pencil, X, Trash2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Member, MemberRole } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { MemberAvatar } from '@/components/member-avatar'

interface MembersClientProps {
  orgId: string
  currentMemberId: string
  initialMembers: Member[]
}

interface MemberFormState {
  display_name: string
  full_name: string
  initials: string
  email: string
  role: MemberRole
}

const EMPTY_FORM: MemberFormState = {
  display_name: '',
  full_name: '',
  initials: '',
  email: '',
  role: 'member',
}

const ROLE_LABELS: Record<MemberRole, string> = {
  admin: 'Admin',
  member: 'Medlem',
}

export function MembersClient({ orgId, currentMemberId, initialMembers }: MembersClientProps) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed')
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [form, setForm] = useState<MemberFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)

  function openAdd() {
    setForm(EMPTY_FORM)
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
    })
    setEditTarget(m)
    setModalMode('edit')
  }

  function closeModal() { setModalMode('closed') }

  async function handleSave() {
    if (!form.display_name.trim() || !form.email.trim() || saving) return
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
    }

    if (modalMode === 'edit' && editTarget) {
      const { error } = await supabase
        .from('members')
        .update(baseFields)
        .eq('id', editTarget.id)
      setSaving(false)
      if (error) {
        toast.error(describeSaveError(error))
        return
      }
      setMembers(prev => prev.map(m => m.id === editTarget.id ? { ...m, ...baseFields } : m))
      toast.success('Endringer lagret')
    } else {
      const { data, error } = await supabase
        .from('members')
        .insert({ ...baseFields, org_id: orgId, is_active: true, nicknames: [] })
        .select()
        .single()
      setSaving(false)
      if (error) {
        toast.error(describeSaveError(error))
        return
      }
      setMembers(prev => [...prev, data].sort((a, b) => a.display_name.localeCompare(b.display_name)))
      toast.success(`${baseFields.display_name} er lagt til`)
    }
    closeModal()
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    if (deleteTarget.id === currentMemberId) {
      toast.error('Du kan ikke slette din egen konto.')
      return
    }
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('members').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { toast.error('Kunne ikke slette medlem.'); return }
    setMembers(prev => prev.filter(x => x.id !== deleteTarget.id))
    toast.success(`${deleteTarget.display_name} er slettet`)
    setDeleteTarget(null)
  }

  async function toggleActive(m: Member) {
    if (m.id === currentMemberId) {
      toast.error('Du kan ikke deaktivere din egen konto.')
      return
    }
    const supabase = createClient()
    const { error } = await supabase
      .from('members')
      .update({ is_active: !m.is_active })
      .eq('id', m.id)
    if (error) { toast.error('Noe gikk galt.'); return }
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, is_active: !x.is_active } : x))
    toast.success(m.is_active ? `${m.display_name} deaktivert` : `${m.display_name} aktivert`)
  }

  const active = members.filter(m => m.is_active)
  const inactive = members.filter(m => !m.is_active)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-[24px] font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
          >
            Teammedlemmer
          </h1>
          <p className="text-[14px] mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {active.length} aktive · {inactive.length} inaktive
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

      {/* Active members */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
      >
        {active.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            Ingen aktive medlemmer
          </div>
        ) : (
          active.map((m, i) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.id === currentMemberId}
              isLast={i === active.length - 1}
              onEdit={() => openEdit(m)}
              onToggle={() => toggleActive(m)}
              onDelete={() => setDeleteTarget(m)}
            />
          ))
        )}
      </div>

      {/* Inactive members */}
      {inactive.length > 0 && (
        <div className="mt-6">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest px-1 mb-2"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Inaktive
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
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={spring.bouncy}
              className="pointer-events-auto w-[440px] max-w-full max-h-[calc(100vh-12vh-2rem)] overflow-y-auto rounded-2xl p-6 flex flex-col gap-4"
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
                  {modalMode === 'add' ? 'Legg til medlem' : 'Rediger medlem'}
                </h2>
                <button onClick={closeModal} style={{ color: 'var(--text-tertiary)' }}>
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>

              {/* Identity group */}
              <div className="flex flex-col gap-4">
                <Field label="Navn" hint="Fornavnet som vises i teamet">
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={e => {
                      const display_name = e.target.value
                      setForm(f => ({
                        ...f,
                        display_name,
                        initials: f.initials || deriveInitials(display_name, f.full_name),
                      }))
                    }}
                    placeholder="Sindre"
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
                        initials: f.initials || deriveInitials(f.display_name, full_name),
                      }))
                    }}
                    placeholder="Sindre Barstad"
                    className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
                  />
                </Field>

                <Field label="E-post">
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

              {/* AI group */}
              <div
                className="flex flex-col gap-2 p-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-subtle)' }}
              >
                <div className="flex items-baseline gap-2">
                  <label
                    className="text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                  >
                    AI-kortkode
                  </label>
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                    2 bokstaver for raske referanser — «ØP uke 18»
                  </span>
                </div>
                <input
                  type="text"
                  value={form.initials}
                  onChange={e => setForm(f => ({ ...f, initials: e.target.value.slice(0, 3).toUpperCase() }))}
                  placeholder="ØP"
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
                  Avbryt
                </button>
                <motion.button
                  onClick={handleSave}
                  disabled={!form.display_name.trim() || !form.email.trim() || saving}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
                  className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
                >
                  {saving ? '...' : modalMode === 'add' ? 'Legg til' : 'Lagre'}
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
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={spring.bouncy}
              className="pointer-events-auto w-[420px] max-w-full rounded-2xl p-6 flex flex-col gap-4"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                boxShadow: 'var(--shadow-xl)',
              }}
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
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
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
                  Avbryt
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

function describeSaveError(error: SupabaseError): string {
  if (error.code === '23505') {
    return error.message?.includes('initials')
      ? 'Initialene er allerede i bruk i teamet.'
      : 'E-posten er allerede i bruk.'
  }
  if (error.code === '42501' || error.message?.toLowerCase().includes('row-level security')) {
    return 'Du må være admin for å endre medlemmer.'
  }
  return error.message || 'Noe gikk galt. Prøv igjen.'
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
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
  onEdit,
  onToggle,
  onDelete,
}: {
  member: Member
  isSelf: boolean
  isLast: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
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
          {member.initials && (
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-md font-mono"
              style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
              title="Initialer"
            >
              {member.initials}
            </span>
          )}
          {isSelf && (
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-md"
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
            {member.role === 'admin' ? 'Admin' : 'Medlem'}
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
