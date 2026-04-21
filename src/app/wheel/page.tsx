import { redirect } from 'next/navigation'
import { YearWheel } from '@/components/year-wheel'
import { getSessionMember } from '@/lib/supabase/session'

export default async function WheelPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  return (
    <div className="mx-auto max-w-[1220px] px-4 sm:px-6 pt-10 md:pt-14 pb-10 md:pb-12">
      <YearWheel orgId={member.org_id} />
    </div>
  )
}
