# Fase 4 — Skalering & polering (9+ måneder) 💤

Mål: Enterprise-klar, internasjonal, compliant. Her konkurrerer du mot Deskbird, Robin, Kadence.

---

## 4.1 Internasjonalisering (i18n) 💤

- [ ] Velg rammeverk: **next-intl** anbefalt for App Router
- [ ] Flytt alle strenger til message-kataloger
- [ ] Språk i prioritert rekkefølge:
  - [ ] Engelsk (nødvendig for internasjonal lansering)
  - [ ] Svensk
  - [ ] Dansk
  - [ ] Tysk
  - [ ] Nederlandsk
  - [ ] Fransk
- [ ] Locale-basert formattering (datoer, tall, valuta)
- [ ] RTL-forberedelse (arabisk/hebraisk — senere)
- [ ] Oversettelses-verktøy: Crowdin eller Lokalise
- [ ] Multi-språk AI-parsing (Claude støtter det allerede, justere prompts)

## 4.2 Enterprise-features 💤

- [ ] **Audit logs**:
  - [ ] Alle CRUD-operasjoner logget
  - [ ] Eksport for compliance
  - [ ] Oppbevaring 7 år (konfigurerbart)
- [ ] **Data residency**: EU vs US-database (Supabase Multi-region)
- [ ] **IP-allowlist** per org
- [ ] **Session-policy**: maks varighet, tving ny auth ved sensitiv handling
- [ ] **Advanced permissions** (field-level, conditional)
- [ ] **Approval workflows** (f.eks. vacation må godkjennes av manager)
- [ ] **Bulk-import** av medlemmer fra CSV eller HRIS
- [ ] **HRIS-integrasjon**: BambooHR, Personio, Workday

## 4.3 Compliance 💤

- [ ] **SOC 2 Type I** (først Type I, så Type II etter 6 mnd)
- [ ] **ISO 27001** (om europeiske enterprise-kunder krever det)
- [ ] **GDPR DPA-maler** klar for signering
- [ ] **HIPAA** (hvis du tar healthcare-kunder)
- [ ] **Vanta/Drata** for compliance-automatisering
- [ ] **Penetrasjonstest** årlig
- [ ] **Bug bounty-program** (HackerOne eller Intigriti)
- [ ] **Security whitepaper** tilgjengelig for prospekter

## 4.4 Skalering av infrastruktur 💤

- [ ] Multi-region deployment (edge)
- [ ] Read-replicas for tunge queries
- [ ] Database sharding per account (om nødvendig)
- [ ] Materialized views for rapporter
- [ ] Redis for hot cache (member-lister, org-settings)
- [ ] Background job-queue (Inngest, Trigger.dev, eller BullMQ)
- [ ] CDN for alle statiske assets
- [ ] Image-pipeline (Imgix, Cloudinary, eller Supabase Transform)

## 4.5 Avanserte rapporter & analytics 💤

- [ ] **Insights-modul** for admins:
  - [ ] Utnyttelsesgrad per kontor over tid
  - [ ] Teamsammensetning-heatmap
  - [ ] Kunde-besøks-trender
  - [ ] Prediksjon: "forventet fremmøte neste uke"
- [ ] **Custom-dashboards** (drag-drop widgets)
- [ ] **Eksport til BI-verktøy** (Looker, PowerBI, Metabase)

## 4.6 Avansert AI / ML 💤

- [ ] **Autonome agenter**: Claude Agent SDK for komplekse flows
  - [ ] "Planlegg en team-dag neste uke" — velger dag, sender invitasjon, booker møterom
- [ ] **Predictive scheduling**: foreslå optimal hybrid-plan per person
- [ ] **Møte-analyse**: lydopptak → referat → oppgaver (frivillig, opt-in)
- [ ] **Semantic search** over entries + notater (pgvector)
- [ ] **Fine-tuned model** for domenespecifikke oppgaver (om ROI viser det)

## 4.7 Markedsplass & økosystem 💤

- [ ] **App marketplace**: tredjepart-integrasjoner + partnerschannels
- [ ] **Partner-program** (revenue share)
- [ ] **Public API v2** med OAuth
- [ ] **Utviklerportal** med sandkasse
- [ ] **Changelog-RSS** for integrasjons-utviklere

## 4.8 White-label SaaS 💤

- [ ] Full white-label: custom domene + branding + SMTP
- [ ] Reseller-program
- [ ] Multi-level tenancy (reseller → kunde → team)

## 4.9 Mobile-native 💤

- [ ] iOS + Android apps (hvis PWA ikke holder)
- [ ] Native widgets for home screen
- [ ] Apple Watch / Wear OS apps
- [ ] Quick Actions (3D Touch / long-press)
- [ ] Shortcuts / App Actions

## 4.10 Community & content 💤

- [ ] Brukercommunity (Slack, Discord, eller Discourse)
- [ ] Webinarer & workshops
- [ ] Årlig kundekonferanse
- [ ] Case study-bibliotek
- [ ] Partner-kanal i bransjeforum (HR Norge, etc.)

---

## Konkurrentreferanser å følge

- **Deskbird** (Sveits) — kontor-booking + hybrid schedules
- **Robin** (USA) — booking + analytics
- **Kadence** (UK) — enkelt, hybrid-fokus
- **Gable** (USA) — ekstern office-as-a-service
- **Envoy** — visitor + workplace management

Differensiator for TeamPulse: **AI-først, norsk-native, team-koordinering (ikke bare booking), customer-visits integrert**.
