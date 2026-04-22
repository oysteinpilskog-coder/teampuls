'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import { Users, Building2, MapPin, Briefcase, Palette } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/settings/members', label: 'Medlemmer', icon: Users },
  { href: '/settings/org', label: 'Organisasjon', icon: Building2 },
  { href: '/settings/offices', label: 'Kontorer', icon: MapPin },
  { href: '/settings/customers', label: 'Kunder', icon: Briefcase },
  { href: '/settings/theme', label: 'Tema', icon: Palette },
]

export function SettingsNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null)

  useEffect(() => {
    if (optimisticHref && pathname.startsWith(optimisticHref)) setOptimisticHref(null)
  }, [pathname, optimisticHref])

  function handleNav(href: string, e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    if (pathname.startsWith(href)) return
    e.preventDefault()
    setOptimisticHref(href)
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <nav className="w-44 shrink-0 flex flex-col gap-0.5">
      <p
        className="text-[11px] font-semibold uppercase tracking-widest px-3 mb-3"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        Innstillinger
      </p>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = optimisticHref === href || (!optimisticHref && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            onClick={(e) => handleNav(href, e)}
            className={[
              'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <Icon className="w-4 h-4" strokeWidth={1.5} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
