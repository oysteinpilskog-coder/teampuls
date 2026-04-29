import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { WheelShell } from '@/components/wheel-shell'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'

export default async function WheelPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  // Org-level kill switches for the new wheel views. Default both on if the
  // column is null/undefined — matches the migration default.
  const supabase = await createSupabaseServerClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('birthdays_enabled, anniversaries_enabled')
    .eq('id', member.org_id)
    .maybeSingle()

  const birthdaysEnabled = org?.birthdays_enabled !== false
  const anniversariesEnabled = org?.anniversaries_enabled !== false

  return (
    <div className="mx-auto max-w-[1220px] px-4 sm:px-6 pt-10 md:pt-14 pb-10 md:pb-12">
      <Suspense fallback={<WheelFallback />}>
        <WheelShell
          orgId={member.org_id}
          birthdaysEnabled={birthdaysEnabled}
          anniversariesEnabled={anniversariesEnabled}
        />
      </Suspense>
    </div>
  )
}

function WheelFallback() {
  return (
    <div className="w-full flex items-center justify-center py-32">
      <div
        className="w-12 h-12 rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, transparent, var(--accent-color))',
          animation: 'spin 1.2s linear infinite',
        }}
      />
    </div>
  )
}
