import { redirect } from 'next/navigation'
import { addDays, getISOWeekYear } from 'date-fns'
import { AIInput } from '@/components/ai-input'
import { MyPlan } from '@/components/my-plan'
import { EmptyState } from '@/components/empty-state'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { getServerDict } from '@/lib/i18n/server'
import { getLastISOWeek, getWeekStart, toDateString } from '@/lib/dates'

export default async function MinPlanPage() {
  const { user, member, isViewerMode } = await getSessionMember()

  if (!user) redirect('/login')

  if (!member) {
    const t = await getServerDict()
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
              <path
                d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.25c-3.75 0-7.5 2.25-7.5 5.25V21h15v-1.5c0-3-3.75-5.25-7.5-5.25Z"
                fill="currentColor"
              />
            </svg>
          }
          title={t.auth.accountNotLinkedTitle}
          description={
            <>
              {t.auth.accountNotLinkedEmailLabel}{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong>{' '}
              {t.auth.accountNotLinkedDescription}
            </>
          }
        />
      </div>
    )
  }

  // SSR-prefetch hele årets entries for dette medlemmet — ellers ville
  // klienten hydrere med tom liste, fyrt sin egen loadEntries() og
  // re-rendre 200 ms senere (synlig blink mellom skeleton og data).
  // Same window som klienten regner ut: ISO-uke 1 → siste ISO-uke i året.
  //
  // I viewer-mode er member.org_id satt til aktivt workspace (som
  // brukeren ikke er medlem av) — Min plan handler om brukerens egen
  // plan, så vi henter den faktiske hjem-org-iden fra members-raden
  // før vi scoper queryen.
  const supabase = await createClient()
  const { data: memberRow } = await supabase
    .from('members')
    .select('org_id')
    .eq('id', member.id)
    .maybeSingle()
  const homeOrgId = memberRow?.org_id ?? member.org_id

  const year = getISOWeekYear(new Date())
  const lastWeek = getLastISOWeek(year)
  const rangeStart = toDateString(getWeekStart(1, year))
  const rangeEnd = toDateString(addDays(getWeekStart(lastWeek, year), 4))
  const { data: initialEntries } = await supabase
    .from('entries')
    .select('*')
    .eq('org_id', homeOrgId)
    .eq('member_id', member.id)
    .gte('date', rangeStart)
    .lte('date', rangeEnd)
    .order('date')

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10 md:py-12">
      <MyPlan
        orgId={homeOrgId}
        memberId={member.id}
        memberName={member.full_name || member.display_name}
        memberInitials={member.initials}
        avatarUrl={member.avatar_url}
        aiInputSlot={isViewerMode ? null : <AIInput orgId={homeOrgId} />}
        initialEntries={initialEntries ?? []}
        initialYear={year}
      />
    </div>
  )
}
