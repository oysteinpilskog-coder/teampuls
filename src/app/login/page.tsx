'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { OffiviewWordmark } from '@/components/brand/offiview-wordmark'
import { useT } from '@/lib/i18n/context'
import { ease, spring } from '@/lib/motion'
import { isAllowedEmail } from '@/lib/auth/allowed-domains'

type Stage = 'email' | 'code'

export default function LoginPage() {
  const [stage, setStage] = useState<Stage>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useT()
  const prefersReducedMotion = useReducedMotion()
  const searchParams = useSearchParams()

  // Surface the proxy/callback redirect reason (e.g. a non-CalWin address was
  // signed out). A live form error always takes precedence over this hint.
  const domainError =
    searchParams.get('error') === 'domain_not_allowed' ? t.auth.domainNotAllowed : null
  const displayError = error ?? domainError

  async function sendCode(targetEmail: string) {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return error
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    // CalWin-only access: don't even send a code to a disallowed domain.
    // The server (proxy + auth callback) enforces this regardless; this is
    // the friendly front door.
    if (!isAllowedEmail(email)) {
      setError(t.auth.domainNotAllowed)
      return
    }
    setLoading(true)
    setError(null)
    const err = await sendCode(email)
    setLoading(false)
    if (err) {
      setError(t.auth.error)
      return
    }
    setStage('code')
  }

  async function handleResend() {
    if (!isAllowedEmail(email)) {
      setError(t.auth.domainNotAllowed)
      return
    }
    setLoading(true)
    setError(null)
    const err = await sendCode(email)
    setLoading(false)
    if (err) setError(t.auth.error)
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setVerifying(true)
    setError(null)
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })
    if (verifyError) {
      setVerifying(false)
      setError(t.auth.codeInvalid)
      return
    }
    // Session is now set in browser. Full nav to '/' so the server
    // can read the new auth cookie and run getSessionMember (which
    // backfills the email→user_id link on first login).
    window.location.href = '/'
  }

  function handleCodeChange(value: string) {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 6)
    setCode(digitsOnly)
    if (error) setError(null)
  }

  function handleUseDifferentEmail() {
    setStage('email')
    setCode('')
    setError(null)
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
            {stage === 'email' ? (
              <motion.form
                key="email"
                onSubmit={handleSendCode}
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
                  {displayError && (
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
                      {displayError}
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
                  {loading ? t.auth.sending : t.auth.sendCodeButton}
                </motion.button>
              </motion.form>
            ) : (
              <motion.form
                key="code"
                onSubmit={handleVerify}
                className="space-y-5"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: ease.horizon }}
              >
                <div className="text-center">
                  <p className="text-[14px] text-[var(--text-secondary)]">
                    {t.auth.codeSentTo}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-[var(--text-primary)] break-all">
                    {email}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="code"
                    className="block text-[13px] font-medium text-[var(--text-secondary)] mb-2"
                  >
                    {t.auth.codeLabel}
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder={t.auth.codePlaceholder}
                    maxLength={6}
                    required
                    autoFocus
                    className="w-full h-14 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-center font-mono text-[24px] tracking-[0.4em] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:tracking-[0.4em] transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent-color)]"
                  />
                </div>

                <AnimatePresence initial={false}>
                  {error && (
                    <motion.p
                      key="error"
                      role="alert"
                      className="text-[13px] text-center"
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
                  disabled={verifying || code.length !== 6}
                  whileHover={prefersReducedMotion || code.length !== 6 ? undefined : { y: -1 }}
                  whileTap={prefersReducedMotion || code.length !== 6 ? undefined : { scale: 0.98 }}
                  transition={spring.snappy}
                  className="w-full h-12 rounded-xl text-[15px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: verifying
                      ? 'color-mix(in oklab, var(--accent-color) 70%, transparent)'
                      : 'var(--accent-color)',
                    boxShadow: verifying || code.length !== 6 ? 'none' : 'var(--shadow-accent)',
                  }}
                >
                  {verifying ? t.auth.verifying : t.auth.verifyButton}
                </motion.button>

                <div className="flex flex-col items-center gap-1.5 pt-1 text-[13px]">
                  <p className="text-[var(--text-tertiary)]">{t.auth.codeOrLinkHint}</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="text-[var(--accent-color)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? t.auth.sending : t.auth.resendCode}
                    </button>
                    <span className="text-[var(--border-subtle)]" aria-hidden>·</span>
                    <button
                      type="button"
                      onClick={handleUseDifferentEmail}
                      className="text-[var(--text-secondary)] hover:underline"
                    >
                      {t.auth.useDifferentEmail}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}
