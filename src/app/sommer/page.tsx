import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AIInput } from '@/components/ai-input'
import { SummerView } from '@/components/summer-view'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { toDateString } from '@/lib/dates'
import type { MemberRole } from '@/lib/supabase/types'

const MIN_YEAR = 2020
const MAX_YEAR = 2099

export default async function SommerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { user, member, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  const sp = await searchParams
  const today = new Date()
  // Sept onwards we're past summer — flip the default to next year so the
  // page is always useful for planning the *upcoming* summer.
  const defaultYear = today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear()
  const requested = Number(sp.year)
  const year = Number.isFinite(requested) && requested >= MIN_YEAR && requested <= MAX_YEAR
    ? requested
    : defaultYear

  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  const start = new Date(year, 5, 1)   // June 1
  const end = new Date(year, 7, 31)    // August 31
  const startStr = toDateString(start)
  const endStr = toDateString(end)

  const supabase = await createSupabaseServerClient()
  const [membersRes, entriesRes] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
      .order('display_name'),
    supabase
      .from('entries')
      .select('*')
      .in('org_id', orgIds)
      .gte('date', startStr)
      .lte('date', endStr),
  ])

  // Combined-mode hides the AI input — the parser can't disambiguate which
  // workspace to write into when several share members ("Johan" could
  // resolve to either side). Same rule as forsiden's HomePage.
  const showAIInput = !combinedScope

  return (
    <div className="mx-auto max-w-[1320px] px-4 sm:px-6 pt-8 md:pt-12 pb-12 space-y-6">
      {showAIInput && (
        <div className="mx-auto max-w-3xl w-full">
          <AIInput orgId={member.org_id} />
        </div>
      )}
      <Suspense fallback={null}>
        <SummerView
          year={year}
          orgIds={orgIds}
          currentMemberId={member.id}
          currentMemberRole={(member.role ?? 'member') as MemberRole}
          initialMembers={membersRes.data ?? []}
          initialEntries={entriesRes.data ?? []}
        />
      </Suspense>
    </div>
  )
}
