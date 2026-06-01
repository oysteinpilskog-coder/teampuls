/**
 * Access allowlist — TeamPulse is locked to CalWin only for now.
 *
 * Single source of truth for which email domains may access the app.
 * Enforced in layers so no single bypass grants access:
 *   1. proxy.ts            — gates every page navigation + refreshes the session
 *   2. auth/callback       — rejects the OTP exchange for disallowed domains
 *   3. lib/supabase/session — treats a disallowed user as logged-out
 *   4. login page          — blocks sending a code to a disallowed address (UX)
 *   5. api/dev-login       — dev shortcut also honours the allowlist
 *
 * When TeamPulse opens up to other tenants (SaaS), replace this with a
 * per-org allowed-domains lookup. Until then: CalWin Nordic + CalWin UK.
 */
export const ALLOWED_EMAIL_DOMAINS = ['calwin.no', 'calwin.se', 'calwin.co.uk'] as const

/** Extract the lower-cased domain part of an email, or null if malformed. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at === -1 || at === email.length - 1) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domain || null
}

/**
 * True only when the email's domain is an EXACT match for an allowed
 * domain. Exact match (not endsWith) deliberately rejects look-alikes
 * such as `evil@calwin.no.attacker.com` and `x@notcalwin.no`.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email)
  return domain !== null && (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain)
}
