'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useTransition, useState, useEffect } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { PresenceIndicator } from '@/components/presence-indicator'
import { openCommandPalette } from '@/components/command-palette'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null)
  const t = useT()

  // `t.nav.today` was removed upstream (the /i-dag page was dropped since
  // Oversikt already shows today), so we don't surface it here either.
  const navLinks = [
    { href: '/', label: t.nav.home },
    { href: '/min-plan', label: t.nav.myPlan },
    { href: '/wheel', label: t.nav.wheel },
    { href: '/dashboard', label: t.nav.dashboard },
    { href: '/settings', label: t.nav.settings },
  ]

  // Drop optimistic target once the URL actually matches it
  useEffect(() => {
    if (optimisticHref && pathname === optimisticHref) setOptimisticHref(null)
  }, [pathname, optimisticHref])

  const activeHref = optimisticHref ?? pathname

  function handleNav(href: string, e: React.MouseEvent<HTMLAnchorElement>) {
    // let cmd/ctrl/middle-click fall through for new-tab behavior
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    if (href === pathname) return
    e.preventDefault()
    setOptimisticHref(href)
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <header className="sticky top-0 z-50">
      {/* Glass bar */}
      <div
        className="relative"
        style={{
          background: 'color-mix(in oklab, var(--bg-primary) 68%, transparent)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        }}
      >
        {/* Top progress shimmer — only visible during pending transition */}
        <motion.div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[2px] origin-left pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--accent-color), transparent)',
          }}
          animate={{
            opacity: isPending ? 1 : 0,
            scaleX: isPending ? [0.1, 0.9] : 0,
          }}
          transition={isPending
            ? { scaleX: { duration: 0.8, ease: 'easeOut' }, opacity: { duration: 0.1 } }
            : { duration: 0.2 }
          }
        />
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center gap-6">
          {/* Wordmark */}
          <Link
            href="/"
            onClick={(e) => handleNav('/', e)}
            className="flex items-center gap-2 shrink-0 select-none group"
          >
            {/* Mark — a gradient dot */}
            <motion.span
              className="relative block w-[22px] h-[22px] rounded-full"
              style={{
                background: 'conic-gradient(from 220deg, hsl(220,90%,62%), hsl(280,75%,62%), hsl(35,95%,60%), hsl(220,90%,62%))',
                boxShadow: '0 0 14px color-mix(in oklab, var(--accent-color) 55%, transparent)',
              }}
              whileHover={{ scale: 1.08, rotate: 20 }}
              transition={spring.snappy}
            >
              <span
                className="absolute inset-[3px] rounded-full"
                style={{ background: 'var(--bg-elevated)' }}
              />
            </motion.span>
            <span
              className="text-[17px] font-semibold tracking-tight"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sora)',
                letterSpacing: '-0.02em',
              }}
            >
              TeamPulse
            </span>
          </Link>

          {/* Nav with animated active pill */}
          <nav
            className="relative flex items-center gap-0.5 flex-1"
            aria-label={t.nav.mainNavAria}
          >
            {navLinks.map(({ href, label }) => {
              const isActive = activeHref === href
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={(e) => handleNav(href, e)}
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  className="relative px-4 py-1.5 text-[13px] font-medium transition-colors"
                  style={{
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: 'color-mix(in oklab, var(--bg-elevated) 85%, transparent)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                      }}
                      transition={spring.snappy}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <PresenceIndicator />
            <WorkspaceSwitcher />
            <motion.button
              type="button"
              onClick={() => openCommandPalette()}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              aria-label={t.nav.openPalette}
              className="group hidden sm:flex items-center gap-2 pl-3 pr-2 h-8 rounded-xl text-[12px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              style={{
                color: 'var(--text-secondary)',
                background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
                backdropFilter: 'blur(14px) saturate(180%)',
                WebkitBackdropFilter: 'blur(14px) saturate(180%)',
                border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
                <path
                  d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 1.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm3.77 6.47 2.12 2.12a.8.8 0 1 1-1.13 1.13l-2.12-2.12a.8.8 0 1 1 1.13-1.13Z"
                  fill="currentColor"
                />
              </svg>
              <span className="hidden md:inline">{t.nav.search}</span>
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md text-[10px] font-semibold"
                style={{
                  background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)',
                  color: 'var(--text-tertiary)',
                  border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '0.02em',
                }}
              >
                ⌘K
              </span>
            </motion.button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}

// Renders the header only on non-auth pages
export function ConditionalHeader() {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/dashboard')
  if (isAuthPage) return null
  return <AppHeader />
}
