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
  // Two concentric rings rotate in opposite directions — feels intentional,
  // never mechanical. Horizon ease (cubic-bezier) instead of linear so the
  // motion breathes like the rest of the app. DESIGN_SYSTEM §7.
  return (
    <div className="w-full flex items-center justify-center py-32">
      <div className="relative w-14 h-14" aria-label="Laster" role="status">
        <div
          className="absolute inset-0 rounded-full opacity-90"
          style={{
            background: 'conic-gradient(from 0deg, transparent, var(--accent-color))',
            animation: 'wheel-spin 1.4s cubic-bezier(0.2, 0.8, 0.3, 1) infinite',
          }}
        />
        <div
          className="absolute inset-2 rounded-full opacity-60"
          style={{
            background: 'conic-gradient(from 180deg, transparent, color-mix(in oklab, var(--accent-color) 70%, transparent))',
            animation: 'wheel-spin-rev 2.0s cubic-bezier(0.2, 0.8, 0.3, 1) infinite',
          }}
        />
      </div>
    </div>
  )
}
