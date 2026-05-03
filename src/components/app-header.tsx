'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useTransition, useState, useEffect } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { PresenceIndicator } from '@/components/presence-indicator'
import { openCommandPalette } from '@/components/command-palette'
import { OffiviewWordmarkAnimated } from '@/components/brand/offiview-wordmark-animated'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useT()

  // `t.nav.today` was removed upstream (the /i-dag page was dropped since
  // Oversikt already shows today), so we don't surface it here either.
  const navLinks = [
    { href: '/', label: t.nav.home },
    { href: '/min-plan', label: t.nav.myPlan },
    { href: '/wheel', label: t.nav.wheel },
    { href: '/sommer', label: t.nav.summer },
    { href: '/dashboard', label: t.nav.dashboard },
    { href: '/settings', label: t.nav.settings },
  ]

  // Drop optimistic target once the URL actually matches it
  useEffect(() => {
    if (optimisticHref && pathname === optimisticHref) setOptimisticHref(null)
  }, [pathname, optimisticHref])

  // Close the mobile sheet whenever the route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll while the mobile sheet is open
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])

  const activeHref = optimisticHref ?? pathname

  function handleNav(href: string, e: React.MouseEvent<HTMLAnchorElement>) {
    // let cmd/ctrl/middle-click fall through for new-tab behavior
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    if (href === pathname) {
      setMobileOpen(false)
      return
    }
    e.preventDefault()
    setOptimisticHref(href)
    setMobileOpen(false)
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-6">
          {/* Offiview wordmark — circle + horizon mark + "ffiview" */}
          <Link
            href="/"
            onClick={(e) => handleNav('/', e)}
            className="flex items-center shrink-0 select-none group outline-none"
            aria-label="Offiview — til forsiden"
            style={{ color: 'var(--text-primary)' }}
          >
            <motion.span
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              style={{ display: 'inline-flex' }}
            >
              <OffiviewWordmarkAnimated size={22} variant="ink" />
            </motion.span>
          </Link>

          {/* Nav with animated active pill — hidden < md, replaced by hamburger */}
          <nav
            className="relative hidden md:flex items-center gap-0.5 flex-1"
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

          {/* Mobile spacer — pushes the right side over when nav is hidden */}
          <div className="flex-1 md:hidden" aria-hidden />

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
            {/* Hamburger — only < md, to the right of the theme toggle */}
            <motion.button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              whileTap={{ scale: 0.94 }}
              transition={spring.snappy}
              aria-label={mobileOpen ? 'Lukk meny' : 'Åpne meny'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-sheet"
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              style={{
                color: 'var(--text-primary)',
                background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
                border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
                <motion.path
                  d="M3 6h14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  animate={mobileOpen ? { d: 'M5 5l10 10' } : { d: 'M3 6h14' }}
                  transition={spring.snappy}
                />
                <motion.path
                  d="M3 14h14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  animate={mobileOpen ? { d: 'M5 15l10 -10' } : { d: 'M3 14h14' }}
                  transition={spring.snappy}
                />
              </svg>
            </motion.button>
          </div>
        </div>

        {/* Mobile sheet — drops down under the bar */}
        <AnimatePresence initial={false}>
          {mobileOpen && (
            <>
              <motion.div
                key="scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="md:hidden fixed inset-0 top-16 z-40"
                style={{
                  background: 'color-mix(in oklab, var(--bg-primary) 35%, transparent)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                }}
                onClick={() => setMobileOpen(false)}
                aria-hidden
              />
              <motion.nav
                key="sheet"
                id="mobile-nav-sheet"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={spring.snappy}
                className="md:hidden absolute left-0 right-0 z-50 px-4 pt-3 pb-4"
                style={{
                  background: 'color-mix(in oklab, var(--bg-primary) 92%, transparent)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                  boxShadow: '0 8px 24px -12px rgba(0,0,0,0.18)',
                }}
                aria-label={t.nav.mainNavAria}
              >
                <ul className="flex flex-col gap-1">
                  {navLinks.map(({ href, label }) => {
                    const isActive = activeHref === href
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={(e) => handleNav(href, e)}
                          className="flex items-center justify-between px-4 py-3 rounded-xl text-[15px] font-medium transition-colors"
                          style={{
                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            background: isActive
                              ? 'color-mix(in oklab, var(--bg-elevated) 85%, transparent)'
                              : 'transparent',
                            boxShadow: isActive
                              ? '0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px color-mix(in oklab, var(--border-subtle) 60%, transparent)'
                              : 'none',
                            fontFamily: 'var(--font-body)',
                          }}
                        >
                          {label}
                          {isActive && (
                            <span
                              aria-hidden
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: 'var(--accent-color)' }}
                            />
                          )}
                        </Link>
                      </li>
                    )
                  })}
                  <li className="mt-1 pt-2" style={{ borderTop: '1px solid color-mix(in oklab, var(--border-subtle) 50%, transparent)' }}>
                    <button
                      type="button"
                      onClick={() => { setMobileOpen(false); openCommandPalette() }}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-medium"
                      style={{
                        color: 'var(--text-secondary)',
                        background: 'color-mix(in oklab, var(--bg-elevated) 60%, transparent)',
                        border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
                        <path
                          d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 1.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm3.77 6.47 2.12 2.12a.8.8 0 1 1-1.13 1.13l-2.12-2.12a.8.8 0 1 1 1.13-1.13Z"
                          fill="currentColor"
                        />
                      </svg>
                      {t.nav.search}
                    </button>
                  </li>
                </ul>
              </motion.nav>
            </>
          )}
        </AnimatePresence>
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
