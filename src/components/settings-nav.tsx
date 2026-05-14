'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import {
  Users,
  Building2,
  MapPin,
  Map,
  Briefcase,
  Palette,
  Languages,
  Sparkles,
  Mail,
  CalendarRange,
  Monitor,
  type LucideIcon,
} from 'lucide-react'
import { useT } from '@/lib/i18n/context'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

interface NavSection {
  label: string
  items: NavItem[]
}

export function SettingsNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null)
  const t = useT()

  // Grouped settings:
  //  • Team — who's in, where they sit, who they visit
  //  • Utseende — what the org looks like (incl. language as a brand-wide choice)
  //  • Skjermer — what shows up on the TV/wall views
  //  • Varsler — anything that leaves the app (email, future Slack, etc.)
  const SECTIONS: NavSection[] = [
    {
      label: t.settings.nav.sectionTeam,
      items: [
        { href: '/settings/members', label: t.settings.nav.members, icon: Users },
        { href: '/settings/offices', label: t.settings.nav.offices, icon: MapPin },
        { href: '/settings/customers', label: t.settings.nav.customers, icon: Briefcase },
      ],
    },
    {
      label: t.settings.nav.sectionBrand,
      items: [
        { href: '/settings/org', label: t.settings.nav.org, icon: Building2 },
        { href: '/settings/theme', label: t.settings.nav.theme, icon: Palette },
        { href: '/settings/map', label: t.settings.nav.map, icon: Map },
        { href: '/settings/language', label: t.settings.nav.language, icon: Languages },
      ],
    },
    {
      label: t.settings.nav.sectionScreens,
      items: [
        { href: '/settings/dashboard', label: t.settings.nav.dashboard, icon: Monitor },
        { href: '/settings/wheel', label: t.settings.nav.wheel, icon: CalendarRange },
        { href: '/settings/welcome', label: t.settings.nav.welcome, icon: Sparkles },
      ],
    },
    {
      label: t.settings.nav.sectionAlerts,
      items: [
        { href: '/settings/email', label: t.settings.nav.email, icon: Mail },
      ],
    },
  ]

  const ALL_ITEMS: NavItem[] = SECTIONS.flatMap(s => s.items)

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

  function isActive(href: string): boolean {
    return optimisticHref === href || (!optimisticHref && pathname.startsWith(href))
  }

  return (
    <nav className="w-full md:w-56 shrink-0 flex flex-col gap-1.5">
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

      {/* Mobile: horizontal scroll-rail of pills — flatten the grouping so the
          rail stays scannable on a phone. Section headings appear as tiny
          dividers between groups. */}
      <div
        className="md:hidden -mx-4 px-4 overflow-x-auto"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex items-center gap-1.5 pb-1 w-max">
          {SECTIONS.map((section, sIdx) => (
            <div key={section.label} className="flex items-center gap-1.5 shrink-0">
              {sIdx > 0 && (
                <span
                  aria-hidden
                  className="block w-px h-5 shrink-0"
                  style={{ background: 'var(--border-subtle)' }}
                />
              )}
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => handleNav(href, e)}
                    className={[
                      'flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-[background,color,box-shadow] duration-150 shrink-0',
                      active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                    ].join(' ')}
                    style={{
                      fontFamily: 'var(--font-body)',
                      background: active
                        ? 'color-mix(in oklab, var(--accent-color) 14%, var(--bg-elevated))'
                        : 'color-mix(in oklab, var(--bg-subtle) 75%, transparent)',
                      border: active
                        ? '1px solid color-mix(in oklab, var(--accent-color) 35%, transparent)'
                        : '1px solid color-mix(in oklab, var(--border-subtle) 50%, transparent)',
                      boxShadow: active
                        ? '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)'
                        : 'none',
                    }}
                  >
                    <Icon
                      className="w-3.5 h-3.5"
                      strokeWidth={1.5}
                      style={active ? { color: 'var(--accent-color)' } : undefined}
                    />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: vertical list with section headings and a clear active rail. */}
      <div className="hidden md:flex md:flex-col md:gap-1">
        {SECTIONS.map((section, sIdx) => (
          <div key={section.label} className={sIdx > 0 ? 'mt-4' : ''}>
            <p
              className="text-[10px] font-semibold uppercase px-4 mb-1.5"
              style={{
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-body)',
                letterSpacing: '0.18em',
                opacity: 0.7,
              }}
            >
              {section.label}
            </p>
            <div className="flex flex-col gap-1">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => handleNav(href, e)}
                    className={[
                      'group relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-xl text-[13px] font-medium transition-[background,color] duration-150',
                      active
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--bg-subtle)_50%,transparent)]',
                    ].join(' ')}
                    style={{
                      fontFamily: 'var(--font-body)',
                      background: active
                        ? 'color-mix(in oklab, var(--accent-color) 10%, var(--bg-elevated))'
                        : undefined,
                      boxShadow: active
                        ? 'inset 0 0 0 1px color-mix(in oklab, var(--accent-color) 22%, transparent), 0 1px 2px rgba(0,0,0,0.04)'
                        : undefined,
                    }}
                  >
                    {/* Active rail — 2px Ember stripe, only when selected. */}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                        style={{ background: 'var(--accent-color)' }}
                      />
                    )}
                    <Icon
                      className="w-4 h-4 shrink-0"
                      strokeWidth={1.5}
                      style={active ? { color: 'var(--accent-color)' } : undefined}
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Keep a flat list reference for accessibility tooling / future audits. */}
      <span hidden aria-hidden data-nav-item-count={ALL_ITEMS.length} />
    </nav>
  )
}
