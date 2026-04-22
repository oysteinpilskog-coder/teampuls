import { redirect } from 'next/navigation'
import { TeamGrid } from '@/components/team-grid'
import { AIInput } from '@/components/ai-input'
import { getSessionMember } from '@/lib/supabase/session'

export default async function HomePage() {
  const { user, member } = await getSessionMember()

  if (!user) redirect('/login')

  // Authenticated but not yet linked to a member record
  if (!member) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div
          className="rounded-2xl p-8 max-w-md"
          style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)' }}
        >
          <h1
            className="text-[24px] font-semibold text-[var(--text-primary)] mb-2"
            style={{ fontFamily: 'var(--font-sora)' }}
          >
            Konto ikke koblet
          </h1>
          <p className="text-[15px] text-[var(--text-secondary)] mb-4">
            E-posten <strong>{user.email}</strong> er ikke lagt til som teammedlem ennå.
          </p>
          <p className="text-[13px] text-[var(--text-tertiary)]">
            Be en admin om å kjøre seed-SQL-en for å opprette din brukerprofil, eller kjør{' '}
            <code className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[12px]">
              002_seed_demo.sql
            </code>{' '}
            i Supabase SQL Editor.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-10">
      <div className="mx-auto max-w-3xl">
        <AIInput orgId={member.org_id} />
      </div>
      <TeamGrid orgId={member.org_id} />
    </div>
  )
}
