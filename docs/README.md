# TeamPulse — Launch Audit & Roadmap

Komplett audit av TeamPulse (Next.js 16 + React 19 + Supabase + Claude AI) med prioritert plan mot lansering og videre.

Alle dokumenter er skrevet som Notion-kompatibel Markdown med avkrysningsbokser. Kopier inn i Notion, eller bruk direkte her.

## Dokumenter

| # | Dokument | Formål |
|---|----------|--------|
| 1 | [`AUDIT.md`](./AUDIT.md) | Oppsummering: hva er solid, hva mangler, scorecards |
| 2 | [`PHASE-1-LAUNCH.md`](./PHASE-1-LAUNCH.md) | **MÅ være på plass før lansering** (kritisk) |
| 3 | [`PHASE-2-POST-LAUNCH.md`](./PHASE-2-POST-LAUNCH.md) | Rett etter lansering (0–3 mnd) |
| 4 | [`PHASE-3-GROWTH.md`](./PHASE-3-GROWTH.md) | Vekstfase (3–9 mnd) |
| 5 | [`PHASE-4-SCALE.md`](./PHASE-4-SCALE.md) | Skalering & polering (9+ mnd) |
| 6 | [`TESTING.md`](./TESTING.md) | Teststrategi + UAT-sjekkliste før lansering |
| 7 | [`BEST-PRACTICES.md`](./BEST-PRACTICES.md) | Kodekvalitet, sikkerhet, ytelse, a11y |
| 8 | [`LAUNCH-CHECKLIST.md`](./LAUNCH-CHECKLIST.md) | Dag-for-dag sjekkliste siste 2 uker før lansering |

## Hvordan lese

1. Start med `AUDIT.md` for å få helhetsbildet.
2. `PHASE-1-LAUNCH.md` er den eneste fasen som blokkerer lansering. Alt annet kan vente.
3. `TESTING.md` og `LAUNCH-CHECKLIST.md` brukes i tandem siste uka før go-live.
4. `BEST-PRACTICES.md` er levende — oppdater når konvensjoner endrer seg.

## Status-legende

- ✅ Ferdig / på plass
- 🟡 Delvis / trenger polish
- ❌ Mangler
- 🔥 Kritisk
- ⚡ Høy prioritet
- 📌 Medium
- 💤 Lav / nice-to-have

## Prinsipper bak prioriteringen

1. **Revenue-first**: Uten betaling og plan-enforcement er det ikke en SaaS.
2. **Trust-first**: Sikkerhet, GDPR, stabilitet og support må være i orden fra dag 1.
3. **Observability-first**: Du kan ikke fikse det du ikke ser — Sentry og logging før lansering.
4. **Feature-cut**: Alt som ikke er på Phase 1-listen kan vente.
