import { redirect } from 'next/navigation'
import { TeamGrid } from '@/components/team-grid'
import { AIInput } from '@/components/ai-input'
import { EmptyState } from '@/components/empty-state'
import { PresenceHeatmap } from '@/components/presence-heatmap'
import { DaysTogether } from '@/components/days-together'
import { InactivityNudge } from '@/components/inactivity-nudge'
import { getSessionMember } from '@/lib/supabase/session'
import { getServerDict } from '@/lib/i18n/server'

export default async function HomePage() {
  const { user, member } = await getSessionMember()

  if (!user) redirect('/login')

  // Authenticated but not yet linked to a member record
  if (!member) {
    const t = await getServerDict()
    return (
      <div className="mx-auto max-w-7xl px-6 py-20">
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
              <path
                d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.25c-3.75 0-7.5 2.25-7.5 5.25V21h15v-1.5c0-3-3.75-5.25-7.5-5.25Z"
                fill="currentColor"
              />
              <circle cx="18.5" cy="6" r="3.5" fill="var(--bg-elevated)" />
              <path d="M18.5 4.25v3.5M16.75 6h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title={t.auth.accountNotLinkedTitle}
          description={
            <>
              {t.auth.accountNotLinkedEmailLabel}{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong> {t.auth.accountNotLinkedDescription}{' '}
              <code className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[12px]">
                002_seed_demo.sql
              </code>{' '}
              {t.auth.accountNotLinkedSuffix}
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-10">
      <div className="mx-auto max-w-3xl">
        <AIInput orgId={member.org_id} />
      </div>
      <TeamGrid orgId={member.org_id} />
      <DaysTogether />
      <PresenceHeatmap orgId={member.org_id} />
      <InactivityNudge orgId={member.org_id} memberId={member.id} />
    </div>
  )
}
