'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { OffiviewWordmark } from '@/components/brand/offiview-wordmark'
import { useT } from '@/lib/i18n/context'
import { ease, spring } from '@/lib/motion'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useT()
  const prefersReducedMotion = useReducedMotion()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(t.auth.error)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        className="w-full max-w-sm"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: ease.horizon }}
      >
        {/* Logo / Wordmark */}
        <motion.div
          className="mb-12 flex flex-col items-center text-center"
          style={{ color: 'var(--text-primary)' }}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: ease.horizon, delay: 0.05 }}
        >
          <OffiviewWordmark size={36} variant="ink" title={t.app.name} />
          <p
            className="mt-5 text-[18px]"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontVariationSettings: '"opsz" 24, "SOFT" 80',
              color: 'var(--text-secondary)',
              letterSpacing: '-0.015em',
            }}
          >
            {t.app.tagline}
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          className="rounded-2xl border border-[var(--border-subtle)] p-8"
          style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)' }}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: ease.horizon, delay: 0.12 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {sent ? (
              <motion.div
                key="sent"
                className="text-center py-4"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring.gentle}
              >
                <motion.div
                  className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'var(--success-tint)' }}
                  initial={prefersReducedMotion ? false : { scale: 0.6, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...spring.bouncy, delay: 0.05 }}
                >
                  <motion.svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                  >
                    <motion.path
                      d="M20 6L9 17l-5-5"
                      stroke="var(--success)"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={prefersReducedMotion ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.36, ease: ease.horizon, delay: 0.18 }}
                    />
                  </motion.svg>
                </motion.div>
                <p className="text-[15px] font-medium text-[var(--text-primary)]">
                  {t.auth.magicLinkSent}
                </p>
                <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">{email}</p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                className="space-y-4"
                initial={false}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: ease.horizon }}
              >
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[13px] font-medium text-[var(--text-secondary)] mb-2"
                  >
                    {t.auth.emailLabel}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder}
                    required
                    autoFocus
                    className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent-color)]"
                  />
                </div>

                <AnimatePresence initial={false}>
                  {error && (
                    <motion.p
                      key="error"
                      role="alert"
                      className="text-[13px]"
                      style={{ color: 'var(--error)' }}
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: ease.horizon }}
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={loading || !email}
                  whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                  transition={spring.snappy}
                  className="w-full h-12 rounded-xl text-[15px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: loading
                      ? 'color-mix(in oklab, var(--accent-color) 70%, transparent)'
                      : 'var(--accent-color)',
                    boxShadow: loading ? 'none' : 'var(--shadow-accent)',
                  }}
                >
                  {loading ? t.auth.sending : t.auth.magicLinkButton}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}
