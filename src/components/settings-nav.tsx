'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import { Users, Building2, MapPin, Map, Briefcase, Palette, Languages, Sparkles, Mail, CalendarRange } from 'lucide-react'
import { useT } from '@/lib/i18n/context'

export function SettingsNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null)
  const t = useT()

  const NAV_ITEMS = [
    { href: '/settings/members', label: t.settings.nav.members, icon: Users },
    { href: '/settings/org', label: t.settings.nav.org, icon: Building2 },
    { href: '/settings/offices', label: t.settings.nav.offices, icon: MapPin },
    { href: '/settings/customers', label: t.settings.nav.customers, icon: Briefcase },
    { href: '/settings/map', label: t.settings.nav.map, icon: Map },
    { href: '/settings/theme', label: t.settings.nav.theme, icon: Palette },
    { href: '/settings/language', label: t.settings.nav.language, icon: Languages },
    { href: '/settings/welcome', label: t.settings.nav.welcome, icon: Sparkles },
    { href: '/settings/email', label: t.settings.nav.email, icon: Mail },
    { href: '/settings/wheel', label: t.settings.nav.wheel, icon: CalendarRange },
  ]

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
    <nav className="w-full md:w-48 shrink-0 flex flex-col gap-1.5">
      <p
        className="hidden md:block text-[10.5px] font-semibold uppercase px-3 mb-3"
        style={{
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.16em',
        }}
      >
        {t.settings.title}
      </p>
      {/* Mobile: horizontal scroll-rail of pills */}
      <div
        className="md:hidden -mx-4 px-4 overflow-x-auto"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex items-center gap-1.5 pb-1 w-max">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = optimisticHref === href || (!optimisticHref && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => handleNav(href, e)}
                className={[
                  'flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-[background,color,box-shadow] duration-150 shrink-0',
                  isActive
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]',
                ].join(' ')}
                style={{
                  fontFamily: 'var(--font-body)',
                  background: isActive
                    ? 'color-mix(in oklab, var(--accent-color) 14%, var(--bg-elevated))'
                    : 'color-mix(in oklab, var(--bg-subtle) 75%, transparent)',
                  border: isActive
                    ? '1px solid color-mix(in oklab, var(--accent-color) 35%, transparent)'
                    : '1px solid color-mix(in oklab, var(--border-subtle) 50%, transparent)',
                  boxShadow: isActive
                    ? '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)'
                    : 'none',
                }}
              >
                <Icon
                  className="w-3.5 h-3.5"
                  strokeWidth={1.5}
                  style={isActive ? { color: 'var(--accent-color)' } : undefined}
                />
                {label}
              </Link>
            )
          })}
        </div>
      </div>
      {/* Desktop: vertical list with a clear active rail */}
      <div className="hidden md:flex md:flex-col md:gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = optimisticHref === href || (!optimisticHref && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(href, e)}
              className={[
                'group relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-xl text-[13px] font-medium transition-[background,color] duration-150',
                isActive
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--bg-subtle)_50%,transparent)]',
              ].join(' ')}
              style={{
                fontFamily: 'var(--font-body)',
                background: isActive
                  ? 'color-mix(in oklab, var(--accent-color) 10%, var(--bg-elevated))'
                  : undefined,
                boxShadow: isActive
                  ? 'inset 0 0 0 1px color-mix(in oklab, var(--accent-color) 22%, transparent), 0 1px 2px rgba(0,0,0,0.04)'
                  : undefined,
              }}
            >
              {/* Active rail — 2px Ember stripe, only when selected. */}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                  style={{ background: 'var(--accent-color)' }}
                />
              )}
              <Icon
                className="w-4 h-4 shrink-0"
                strokeWidth={1.5}
                style={isActive ? { color: 'var(--accent-color)' } : undefined}
              />
              <span className="truncate">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
