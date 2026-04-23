# Launch Checklist — Siste 2 uker før go-live

Dag-for-dag sjekkliste. Hver boks skal krysses av med initialer + dato.

---

## T-14: Freeze features

- [ ] Feature freeze deklarert (ingen nye features, kun bugfixes)
- [ ] Alle fase-1-oppgaver i `PHASE-1-LAUNCH.md` krysset av
- [ ] Prod-miljø er oppe og kjører
- [ ] Separat Supabase-prosjekt for prod eksisterer
- [ ] Separat Anthropic-nøkkel med spending cap
- [ ] Separat Stripe live-mode
- [ ] DNS peker på riktig sted
- [ ] SSL gyldig

## T-13: Testbrukere rekruttert

- [ ] 5–10 testbrukere bekreftet (gjerne mix: 2 solo, 2 små team, 2 større team)
- [ ] UAT-dokument sendt (`TESTING.md` manuell QA-seksjon)
- [ ] Feedback-kanal etablert (Slack, Discord, eller email-tråd)

## T-12 til T-8: UAT-uke

- [ ] Dag 1: Signup + onboarding (alle)
- [ ] Dag 2: Kjerneflyt i 2 timer (alle)
- [ ] Dag 3: Samle feedback, prioriter blokkere
- [ ] Dag 4–5: Fiks P0/P1 bugs
- [ ] Re-test på alle P0 fikser

## T-7: Siste tekniske verifisering

### Sikkerhet
- [ ] CSP-headers aktive (verifiser i DevTools)
- [ ] HSTS preload-klar
- [ ] Alle Supabase-RLS policies testet
- [ ] Pen-test rapport gjennomgått (hvis kjørt)
- [ ] `npm audit` rent (ingen high/critical)
- [ ] Secrets ikke i git-historikk (`gitleaks`)

### Data
- [ ] Supabase PITR påskrudd (krever Pro-plan)
- [ ] Test-restore kjørt på staging fra backup
- [ ] Seed-data ikke i prod
- [ ] Demo-org (CalWin) ikke i prod, eller markert tydelig

### Observability
- [ ] Sentry fanger feil (test med bevisst error)
- [ ] Logs streames til aggregator (verifiser)
- [ ] Uptime-monitor peker på prod
- [ ] Status-page oppe
- [ ] Alerts til telefon/Slack testet

### Performance
- [ ] Lighthouse Prod Perf ≥ 90
- [ ] Core Web Vitals grønne
- [ ] Load-test 100 samtidige brukere passerer
- [ ] DB-queries under 100ms p95

### Billing
- [ ] Stripe live-mode test med ekte kort (kreditér tilbake)
- [ ] Webhook endpoints verifisert i live-mode
- [ ] Plan-enforcement: test at free-bruker ikke når pro-features
- [ ] Faktura-PDF genereres riktig
- [ ] VAT/MVA konfigurert for EU

### Juridisk
- [ ] Privacy policy live og lenket
- [ ] ToS live og lenket
- [ ] DPA tilgjengelig (PDF eller side)
- [ ] Cookie-banner fungerer
- [ ] GDPR-eksport testet (ekte bruker)
- [ ] GDPR-sletting testet (ekte bruker)
- [ ] Subprocessor-liste publisert

## T-5: Marketing-forberedelser

- [ ] Landing page live
- [ ] Pricing-side live
- [ ] Changelog / blog-post "v1.0" klart
- [ ] Social media-annonseringer drafted
- [ ] Email til waitlist skrevet
- [ ] Product Hunt-post forberedt (hvis relevant)
- [ ] LinkedIn-post forberedt
- [ ] Demo-video (< 2 min) klart

## T-3: Support-beredskap

- [ ] Support-email koblet til inbox som overvåkes
- [ ] FAQ live
- [ ] Hjelpesenter med 10–20 artikler
- [ ] Crisp/Intercom-widget aktiv
- [ ] On-call person defintert (24/7 første uka)
- [ ] SLA kommunisert (response < 4t business hours)

## T-2: Rolig pre-launch dag

- [ ] Ingen deploys de siste 48 timene (kun P0 fikser)
- [ ] Hvile + oppladning
- [ ] Gå gjennom runbook for incident
- [ ] Verify at alt fra T-7 fortsatt er grønt

## T-1: Final check

- [ ] Smoke-suite grønn
- [ ] Manuell kjerneflyt verifisert i prod (med test-konto)
- [ ] Logout + re-signup som ny bruker — fungerer
- [ ] Betaling med test-kort → oppgradert → downgrade — fungerer
- [ ] Team med 5 medlemmer — verifisert realtime mellom dem
- [ ] Alle emails sendes og kommer frem
- [ ] AI-parse på 10 ulike norske fraser — fungerer
- [ ] Status-page oppdatert: "All systems operational"

## T-0: Launch Day 🚀

### Morgen
- [ ] Deploy siste bugfix-batch (hvis noen)
- [ ] Verifiser at Sentry-queue er tom
- [ ] Annonsér: waitlist-email → social → Product Hunt
- [ ] Åpne signup offentlig (fjern waitlist-gate)

### Første 4 timer
- [ ] Overvåk Sentry aktivt
- [ ] Overvåk Stripe dashboard (første betalinger)
- [ ] Overvåk Supabase (DB-belastning, connection pool)
- [ ] Respons på all feedback innen 1 time
- [ ] Twitter/LinkedIn: del traction

### Kveld
- [ ] Status-update på blog eller sosialt
- [ ] Gjennomgang av første dags metrics:
  - Antall signups
  - Antall aktiverte (≥ 1 entry)
  - Antall betalende
  - Error rate
  - Support-volum
- [ ] Notér issues for T+1

## T+1 til T+7: Stabilisering

- [ ] Daglig metrics-gjennomgang
- [ ] Hot-fixes kun for kritiske bugs
- [ ] Svar på all feedback/support
- [ ] Post-mortem for eventuelle incidenter
- [ ] Retrospektiv T+7: hva lærte vi?

---

## Rollback-plan (worst case)

Hvis noe er alvorlig galt:

1. **Umiddelbart**: Sett status-page til "degraded" eller "down"
2. **Innen 5 min**: Vurder om issue kan hot-fixes eller om rollback er nødvendig
3. **Rollback**: Vercel → previous deployment (ett klikk)
4. **DB**: Ikke roll back DB hvis data er skrevet (migrasjoner er forward-only) — fiks forward
5. **Kommuniser**: Status-page + email til berørte brukere innen 30 min
6. **Post-incident**: Post-mortem innen 48 timer

---

## Success-kriterier første 30 dager

- [ ] 50+ signups
- [ ] 20+ aktiverte orgs
- [ ] 5+ betalende
- [ ] NPS ≥ 30
- [ ] Error rate < 0.5%
- [ ] Uptime > 99.5%
- [ ] Support response < 4t
- [ ] Ingen SEV1-incidenter

Hvis vi lander alt dette: klar for Fase 2.
