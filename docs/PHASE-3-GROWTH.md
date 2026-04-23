# Fase 3 — Vekst (3–9 måneder) 📌

Mål: Bli den åpenbare valg for nordiske team som koordinerer hybrid arbeid. Integrasjoner, plattformutvidelse, stickiness.

---

## 3.1 Kalenderintegrasjoner 📌

**Dette er den største veksthåndtaket.** Bedrifter lever i Google/Outlook.

- [ ] **Google Calendar**:
  - [ ] OAuth 2.0 flow (per bruker)
  - [ ] Les events → foreslå statuser (customer meeting → customer-status)
  - [ ] Push TeamPulse-entries til valgt kalender (valgfritt)
  - [ ] Toveis sync med conflict-resolution
  - [ ] Webhook for endringer (push notifications)
- [ ] **Microsoft Outlook / Graph API**:
  - [ ] Samme som Google, via Microsoft Graph
  - [ ] Enterprise-SSO forberedelse
- [ ] **iCal-feed** (read-only export):
  - [ ] Per-bruker URL
  - [ ] Team-wide URL (admin)
- [ ] **Apple Calendar** via iCal-subscription

## 3.2 Chat-integrasjoner 📌

- [ ] **Slack**:
  - [ ] Slash-command `/teampuls remote fredag`
  - [ ] Daily digest til kanal
  - [ ] Interactive message: "Sett status" knapper
  - [ ] OAuth install flow
  - [ ] Slack App Directory-oppføring
- [ ] **Microsoft Teams**:
  - [ ] Teams Bot
  - [ ] Adaptive cards for daglig status
  - [ ] Tab-app for Team Grid
- [ ] **Discord** (hvis kundebehov dukker opp)

## 3.3 API for kunder 📌

- [ ] REST API v1 dokumentert
- [ ] OpenAPI/Swagger-spec
- [ ] API-nøkler per org (scope-basert)
- [ ] Rate-limits per nøkkel
- [ ] Webhooks (entry.created/updated/deleted, member.invited)
- [ ] SDK-er: TypeScript + Python
- [ ] API-docs-side (Scalar eller Mintlify)
- [ ] Zapier-integrasjon (gir stor eksponering)
- [ ] Make (Integromat) blueprint

## 3.4 Rapporter & eksport 📌

- [ ] CSV-eksport av entries per periode
- [ ] PDF-rapport (månedlig oversikt, pr. bruker)
- [ ] Office-utnyttelse-rapport (for facilities management)
- [ ] Kunde-besøks-rapport (for salg/CRM)
- [ ] Plandisc-kompatibel eksport (PNG/PDF av year wheel)
- [ ] Google Sheets integration

## 3.5 SSO / Enterprise auth 📌

- [ ] **Google Workspace SSO** (OIDC)
- [ ] **Microsoft Entra ID** (Azure AD)
- [ ] **SAML 2.0** (Okta, OneLogin, JumpCloud)
- [ ] SCIM for user provisioning (gated til Enterprise-plan)
- [ ] Tving SSO per domene (bedrift-kontroll)

## 3.6 Avanserte permissions 📌

- [ ] **Custom roller** ut over admin/member:
  - [ ] viewer (read-only)
  - [ ] editor (kan endre andres entries med audit)
  - [ ] office_manager (kun office/customer-settings)
- [ ] **Team/avdelinger** innenfor en org:
  - [ ] Gruppe-filter på Team Grid
  - [ ] Avdelings-specifikke events
  - [ ] Manager ser kun sitt team
- [ ] **Gjest-tilgang** (ekstern konsulent)

## 3.7 Mobile app 📌

- [ ] Vurder: PWA vs React Native
- [ ] Hvis React Native:
  - [ ] Expo eller bare bones
  - [ ] Push notifications (iOS + Android)
  - [ ] Widgets (iOS WidgetKit, Android Glance)
  - [ ] App Store + Play Store oppføring
- [ ] Hvis PWA:
  - [ ] Service worker for offline
  - [ ] Push API (Web Push)
  - [ ] App Install Banner

## 3.8 Avansert AI 📌

- [ ] **Proactive suggestions**:
  - [ ] "Basert på forrige uke, vil du satse på samme plan?"
  - [ ] "Det er møte med Acme torsdag — sette customer-status?"
- [ ] **AI-assistant-panel**: chat med kalenderen
  - [ ] "Når er neste team-dag?"
  - [ ] "Hvor mye har vi vært på kontoret i mars?"
  - [ ] "Er noen tilgjengelig for lunsj fredag?"
- [ ] **Claude Haiku** for billigere klassifisering av enkle inputs
- [ ] **Prompt-caching optimization** (allerede på plass, mål costs)
- [ ] Feedback-loop: bruker kan korrigere AI → fine-tune prompt

## 3.9 Bedre koordinering 📌

- [ ] **"Finn en dag"-funksjon**: "Når kan 5+ personer møtes på kontor?"
- [ ] **Avstemning**: admin foreslår dager, team stemmer
- [ ] **Booking-synk med møterom** (Google Resources, Outlook Rooms)
- [ ] **Parkeringsplasser-booking** integrert
- [ ] **Lunsj-koordinering** (valgfritt add-on)

## 3.10 Customer management utvidet 📌

- [ ] CRM-sync: HubSpot, Salesforce, Pipedrive
- [ ] Automatisk match: customer-møte i Google Calendar → customer-status
- [ ] Heatmap: hvilke kunder besøkt hvor ofte
- [ ] Kunde-visit-timeline

## 3.11 White-label / branding 💤

- [ ] Custom subdomain per enterprise-kunde
- [ ] Custom favicon + logo i hele UI
- [ ] Custom farger (allerede delvis)
- [ ] Custom email-sender-domene

## 3.12 Team-sider 📌

- [ ] Team-profil med bio, ferdigheter, lokasjon
- [ ] Organisasjonskart (auto-generert fra manager-felt)
- [ ] Birthday-kalender
- [ ] Work anniversaries
- [ ] Onboarding-buddy-match

---

## Tekniske investeringer i denne fasen

- [ ] Event-bus / queue (BullMQ på Redis) for bakgrunnsjobber
- [ ] Cron-jobber (weekly digest, reminder emails)
- [ ] Read-replica for tunge rapporter
- [ ] CDN for user-uploaded content
- [ ] Data warehouse-setup (BigQuery eller DuckDB) for analytics
- [ ] Feature flag-system (LaunchDarkly eller PostHog)
