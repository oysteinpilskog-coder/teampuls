import { redirect } from 'next/navigation'
import { AIInput } from '@/components/ai-input'
import { MyPlan } from '@/components/my-plan'
import { getSessionMember } from '@/lib/supabase/session'

export default async function MinPlanPage() {
  const { user, member } = await getSessionMember()

  if (!user) redirect('/login')

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
          <p className="text-[15px] text-[var(--text-secondary)]">
            E-posten <strong>{user.email}</strong> er ikke lagt til som teammedlem ennå.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 md:py-12 space-y-10">
      <div className="mx-auto max-w-3xl">
        <AIInput orgId={member.org_id} />
      </div>
      <MyPlan
        orgId={member.org_id}
        memberId={member.id}
        memberName={member.display_name}
        avatarUrl={member.avatar_url}
      />
    </div>
  )
}
