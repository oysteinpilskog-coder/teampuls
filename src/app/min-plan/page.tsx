import { redirect } from 'next/navigation'
import { AIInput } from '@/components/ai-input'
import { MyPlan } from '@/components/my-plan'
import { EmptyState } from '@/components/empty-state'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { isSupportedCountry, type CountryCode } from '@/lib/holidays'
import { getServerDict } from '@/lib/i18n/server'

export default async function MinPlanPage() {
  const { user, member } = await getSessionMember()

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

  // Resolve the signed-in user's home-office country code so the year-stripe
  // can mark public holidays in the correct locale (NO/SE/LT/GB). Falls back
  // to NO when the member has no home office or the country is unsupported.
  const supabase = await createClient()
  const { data: memberRow } = await supabase
    .from('members')
    .select('home_office_id, offices:home_office_id(country_code)')
    .eq('id', member.id)
    .maybeSingle()

  const rawCountry = (memberRow?.offices as { country_code?: string | null } | null)?.country_code
  const country: CountryCode = isSupportedCountry(rawCountry) ? rawCountry : 'NO'

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10 md:py-12">
      <MyPlan
        orgId={member.org_id}
        memberId={member.id}
        memberName={member.full_name || member.display_name}
        memberInitials={member.initials}
        avatarUrl={member.avatar_url}
        country={country}
        aiInputSlot={<AIInput orgId={member.org_id} />}
      />
    </div>
  )
}
