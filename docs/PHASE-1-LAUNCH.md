# Fase 1 — MÅ være på plass før lansering 🔥

Alle punkter her blokkerer lansering. Ikke gå live uten disse.

**Estimat:** 4–5 uker med én utvikler på heltid.

---

## 1.1 Billing & plan-enforcement 🔥

Uten betaling er det ikke en SaaS.

- [ ] Velg betalingsleverandør (**anbefalt: Stripe Billing**, alternativ: Lemonsqueezy for merchant-of-record i EU)
- [ ] Definer planer: `free` (begrenset), `pro` (X kr/bruker/mnd), `enterprise` (custom)
- [ ] Sett grenser per plan (antall brukere, antall AI-requests/mnd, antall workspaces, historikk-tilgang)
- [ ] Stripe Customer + Subscription knyttet til `accounts.id`
- [ ] Stripe Checkout session ved signup
- [ ] Stripe Customer Portal for oppgradering/nedgradering/fakturaer
- [ ] Webhook-handler: `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`
- [ ] Utvid `accounts`-tabell: `stripe_customer_id`, `stripe_subscription_id`, `plan`, `trial_ends_at`, `current_period_end`, `status`
- [ ] Plan-gate middleware: `requirePlan('pro')` på gated endepunkter
- [ ] Feature flags per plan: workspace-antall, customer-registry, AI-kvote
- [ ] Trial-flyt: 14 dager full pro, kreditkort ved signup (eller ikke — ta en avgjørelse)
- [ ] AI-kvote-sporing: increment counter per org, reset månedlig, hard-fail ved overskridelse
- [ ] E-post ved `payment_failed` (3 forsøk → suspender)
- [ ] Grace period 7 dager etter failed payment før read-only mode
- [ ] Dunning-sekvens (3 e-poster før suspension)
- [ ] Moms/VAT-håndtering (Stripe Tax eller manuell)
- [ ] Faktura-PDF tilgjengelig i portal

## 1.2 Error tracking & observability 🔥

- [ ] **Sentry** (Next.js integrasjon + Node SDK)
  - [ ] Frontend errors (ErrorBoundary wrapper)
  - [ ] API route errors
  - [ ] Source maps uploadet ved build
  - [ ] Release-tagging med git SHA
  - [ ] PII-scrubbing av email/user_id der relevant
  - [ ] Alerts til Slack/email ved spike
- [ ] **Strukturert logging** (pino eller console-JSON)
  - [ ] Erstatt alle `console.log/error/warn` i `/api/*`
  - [ ] Request ID i hver log-linje
  - [ ] Log-nivåer: debug/info/warn/error
- [ ] **Uptime monitoring** (BetterStack, UptimeRobot, eller Pingdom)
  - [ ] Check mot `/api/health` hvert 1 min
  - [ ] Status page (offentlig eller intern)
  - [ ] SMS/Slack-alerts ved outage
- [ ] **Health check endpoint** `/api/health`
  - [ ] Sjekker Supabase-tilkobling
  - [ ] Sjekker Anthropic-tilgang
  - [ ] Returnerer versjon + uptime

## 1.3 Rate limiting 🔥

- [ ] **Upstash Redis** (serverless, gratis tier holder til start)
- [ ] Middleware på alle `/api/*` ruter
- [ ] Kvoter:
  - [ ] `/api/ai/parse`: 20/min per bruker, 200/time per org
  - [ ] `/api/email-inbound`: 60/min per org (CloudMailin retry-safe)
  - [ ] `/api/geocode`: 30/min per bruker (Nominatim har egne limits)
  - [ ] `/api/auth/*`: 10/min per IP (brute-force beskyttelse)
- [ ] 429-respons med `Retry-After`-header
- [ ] Metrics: track hvor ofte kvoter treffes

## 1.4 Input-validering (Zod) 🔥

- [ ] Installer `zod`
- [ ] Schema for hver API-rute:
  - [ ] `/api/ai/parse` — `{ text: string().min(1).max(2000), memberId?: uuid() }`
  - [ ] `/api/ai/suggest-days` — definer shape
  - [ ] `/api/email-inbound` — CloudMailin JSON-struktur
  - [ ] `/api/geocode` — koordinater/query
  - [ ] `/api/workspace/switch` — `{ orgId: uuid() }`
- [ ] Shared schemas for DB-entiteter (speiler Supabase-typer)
- [ ] Skjema-validering på alle forms (org-settings, members, offices, customers)
- [ ] React Hook Form + Zod resolver
- [ ] 400-respons med feltspesifikke feilmeldinger

## 1.5 Tester (kritisk path) 🔥

Se `TESTING.md` for full strategi. Minimum:

- [ ] Vitest + React Testing Library oppsett
- [ ] Playwright oppsett for E2E
- [ ] **Unit-tester:**
  - [ ] `parseUpdate()` — Claude-respons parsing (mocked)
  - [ ] `applyUpdates()` — insert/update/delete-logikk
  - [ ] `suggestDays()` — koordineringsalgoritme
  - [ ] Date-utils (ISO-uker, ranges)
  - [ ] Customer-resolver (alias-matching)
  - [ ] Presence-logikk
- [ ] **Integrasjonstester:**
  - [ ] `/api/ai/parse` end-to-end (mot test-DB)
  - [ ] `/api/email-inbound` med gyldig + ugyldig token
  - [ ] Workspace-switch flyt
  - [ ] RLS: bruker A kan ikke lese bruker B sine entries
- [ ] **E2E (Playwright):**
  - [ ] Login → team grid → legg til entry via AI
  - [ ] Bytt workspace
  - [ ] Admin legger til member
  - [ ] Bruker sletter sin egen entry
- [ ] **Smoke-suite** som kjører på deploy (< 2 min)

## 1.6 CI/CD ⚡

- [ ] `.github/workflows/ci.yml`:
  - [ ] Type-check (`tsc --noEmit`)
  - [ ] Lint (ESLint)
  - [ ] Format-check (Prettier)
  - [ ] Unit + integration tests
  - [ ] Build (`next build`)
- [ ] `.github/workflows/e2e.yml` på PR (nightly i tillegg)
- [ ] Vercel preview deployments per PR
- [ ] Branch protection på `main` (PR + passing CI påkrevd)
- [ ] Auto-deploy til prod på merge til `main`

## 1.7 Linting & formatering ⚡

- [ ] ESLint med `eslint-config-next` + TypeScript-regler
- [ ] Prettier med prosjekt-config
- [ ] Husky + lint-staged for pre-commit
- [ ] Conventional commits (valgfritt men anbefalt)
- [ ] `.editorconfig`

## 1.8 Miljø & konfigurasjon ⚡

- [ ] `.env.example` med alle påkrevde variabler + kommentarer
- [ ] Runtime env-validering (`@t3-oss/env-nextjs` eller egen Zod-schema)
- [ ] Separate env per miljø: dev, preview, prod
- [ ] Secrets i Vercel/Supabase Vault (ikke i kode)
- [ ] Dokumenter hvordan man kjører lokalt i `README.md`

## 1.9 Sikkerhetsheadere ⚡

- [ ] `next.config.ts` headers():
  - [ ] `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `X-Frame-Options: DENY`
  - [ ] `Referrer-Policy: strict-origin-when-cross-origin`
  - [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
  - [ ] `Content-Security-Policy` (nonce-basert for Next.js, test i report-only først)
- [ ] HTTPS redirect (Vercel default OK)
- [ ] Secure + HttpOnly + SameSite=Lax på auth-cookies

## 1.10 Auth & signup-flyt 🔥

- [ ] **Self-serve signup**:
  - [ ] Signup-side med email + organisasjonsnavn
  - [ ] Opprett account + org + initial admin-member i én transaksjon
  - [ ] Sjekk mot reserverte slugs
  - [ ] Slug-kollisjoner: auto-suffix eller be bruker velge
- [ ] **Team-invite**:
  - [ ] Admin kan sende invite-email med signed token
  - [ ] Invite-side aksepterer og linker user_id til member
  - [ ] Utløp etter 7 dager
  - [ ] Resend invite
- [ ] **Auto-link fix**: Verifiser at linking i `/auth/callback` er idempotent
- [ ] **Session-refresh**: Middleware verifiseres mot alle beskyttede ruter
- [ ] **Logout** fungerer og clearer cookies
- [ ] **Passordløs er OK**, men: dokumenter at kun email-adresser som finnes som member kan logge inn (før signup finnes)

## 1.11 Outbound email (minimum) ⚡

For magic link funker Supabase, men trenger egen avsender:

- [ ] Velg leverandør: **Resend** (enkelt), SendGrid, eller Postmark
- [ ] Verifiser sender-domene (SPF + DKIM + DMARC)
- [ ] Mal-system (React Email eller MJML)
- [ ] Maler for:
  - [ ] Team-invite
  - [ ] Payment failed
  - [ ] Subscription cancelled
  - [ ] Welcome email
  - [ ] Weekly digest (kan vente til fase 2)
- [ ] Unsubscribe-logikk for ikke-transaksjonelle
- [ ] Rate-limit outbound (unngå abuse)

## 1.12 Juridisk & compliance 🔥

- [ ] **Personvernerklæring** (Privacy Policy) på norsk + engelsk
- [ ] **Brukervilkår** (Terms of Service)
- [ ] **Databehandleravtale (DPA)** tilgjengelig for bedriftskunder
- [ ] **Cookie-erklæring** + consent-banner (for analytics)
- [ ] **GDPR-funksjoner**:
  - [ ] Data-eksport (alle entries + profil som JSON)
  - [ ] Konto-sletting (hard-delete etter 30 dager grace)
  - [ ] Retten til retting (edit profile)
  - [ ] Dataportabilitet
- [ ] **Subprocessor-liste** publisert (Supabase, Anthropic, Vercel, Stripe, Resend)
- [ ] **Databehandlingslogg** internt (GDPR art. 30)
- [ ] Logo + kontaktinfo i footer på alle sider
- [ ] Impressum / selskapsinfo (org.nr, adresse)

## 1.13 Backup & disaster recovery 🔥

- [ ] Supabase PITR (Point-in-Time Recovery) aktivert — **krever Pro-plan**
- [ ] Test restore fra backup i staging
- [ ] Dokumenter RTO (Recovery Time Objective) + RPO
- [ ] Eksport-jobb: ukentlig snapshot av DB til egen bucket
- [ ] Runbook for incident response (hvem, hvordan, kommunikasjon)

## 1.14 Produksjonsmiljø ⚡

- [ ] Produksjon-domene (teampuls.no / .com)
- [ ] SSL via Vercel/Cloudflare
- [ ] DNS: A/CNAME + MX (for CloudMailin) + SPF/DKIM/DMARC
- [ ] Separat Supabase-prosjekt for prod (ikke delt med dev)
- [ ] Separat Stripe-konto eller live-mode
- [ ] Separat Anthropic API-nøkkel med spending cap
- [ ] Favicon + Open Graph bilder + robots.txt + sitemap.xml
- [ ] 404 + 500 sider med merkevare

## 1.15 Support ⚡

- [ ] Support-email (support@teampuls.no)
- [ ] Feedback-widget eller email-lenke i app
- [ ] Enkel FAQ / hjelpeside
- [ ] Statusside (StatusPage, Better Stack Status, eller Vercel)
- [ ] On-call rotasjon definert (selv om det er 1 person)

## 1.16 Performance-baseline ⚡

- [ ] Lighthouse-score ≥ 90 på Perf/Accessibility/Best Practices
- [ ] Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] `next/image` for logoer (eller sharp-pipeline i Supabase Storage)
- [ ] Bundle-analyzer kjørt; fjern det som ikke brukes
- [ ] DB-indexer på `entries(org_id, date)` og `entries(member_id, date)`
- [ ] Test med 1000+ entries i ett org (seed) — verifiser rendering

## 1.17 Opprydding 📌

- [ ] Slett eller dokumenter `src/proxy.ts`
- [ ] Slett ubrukte SVG-er i `public/` (next.svg, vercel.svg, etc.)
- [ ] Fjern ubrukte dependencies
- [ ] Fjern demo-seed fra prod-migrasjoner (eller gate bak `NODE_ENV=development`)

---

## Definition of Done for Fase 1

- Alle boksene over er krysset av ✅
- Alle tester er grønne i CI
- Lighthouse ≥ 90 på hovedsidene
- 5+ eksterne testbrukere har fullført UAT (`LAUNCH-CHECKLIST.md`)
- Runbook for incident finnes
- Juridiske dokumenter er publisert og lenket
- Stripe live-mode er testet med ekte kort (lite beløp)
- Backup-restore er faktisk gjennomført i staging
