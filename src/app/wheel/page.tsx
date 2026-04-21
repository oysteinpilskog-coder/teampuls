import { redirect } from 'next/navigation'
import { YearWheel } from '@/components/year-wheel'
import { getSessionMember } from '@/lib/supabase/session'

export default async function WheelPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  return (
    <div className="mx-auto max-w-[1220px] px-4 sm:px-6 py-8">
      <YearWheel orgId={member.org_id} />
    </div>
  )
}
