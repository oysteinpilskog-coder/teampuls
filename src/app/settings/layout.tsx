import { redirect } from 'next/navigation'
import { SettingsNav } from '@/components/settings-nav'
import { getSessionMember } from '@/lib/supabase/session'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member || member.role !== 'admin') redirect('/')

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex gap-10">
        <SettingsNav />
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
