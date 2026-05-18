import { redirect } from 'next/navigation'
import { AIInput } from '@/components/ai-input'
import { MyPlan } from '@/components/my-plan'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { isSupportedCountry, type CountryCode } from '@/lib/holidays'

export default async function MinPlanPage() {
  const { user, member, isViewerMode } = await getSessionMember()

  if (!user) redirect('/login')

  if (!member) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
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

  // Resolve the signed-in user's home-office country code so the year-stripe
  // can mark public holidays in the correct locale (NO/SE/LT/GB). Falls back
  // to NO when the member has no home office or the country is unsupported.
  //
  // We also grab the member row's actual org_id. In viewer-mode the
  // session's `member.org_id` is set to the *active workspace* (for
  // read scoping) which may differ from the workspace this user is
  // actually a member of — and "Min plan" is intrinsically about
  // *the user's own entries*, so it must always scope to the user's
  // home org regardless of which workspace they're currently viewing.
  const supabase = await createClient()
  const { data: memberRow } = await supabase
    .from('members')
    .select('org_id, home_office_id, offices:home_office_id(country_code)')
    .eq('id', member.id)
    .maybeSingle()

  const rawCountry = (memberRow?.offices as { country_code?: string | null } | null)?.country_code
  const country: CountryCode = isSupportedCountry(rawCountry) ? rawCountry : 'NO'
  const homeOrgId = memberRow?.org_id ?? member.org_id

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10 md:py-12">
      <MyPlan
        orgId={homeOrgId}
        memberId={member.id}
        memberName={member.full_name || member.display_name}
        memberInitials={member.initials}
        avatarUrl={member.avatar_url}
        country={country}
        aiInputSlot={isViewerMode ? null : <AIInput orgId={homeOrgId} />}
      />
    </div>
  )
}
