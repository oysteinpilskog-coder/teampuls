import { getISOWeek } from '@/lib/dates'
import type { Member, Customer, Office } from '@/lib/supabase/types'

const WEEKDAY_NORWEGIAN: Record<number, string> = {
  0: 'søndag', 1: 'mandag', 2: 'tirsdag', 3: 'onsdag',
  4: 'torsdag', 5: 'fredag', 6: 'lørdag',
}

function getWeekdayNorwegian(date: Date): string {
  return WEEKDAY_NORWEGIAN[date.getDay()]
}

/**
 * A past correction: the user edited an AI-written entry into something
 * materially different. The parser few-shots from these to learn which
 * phrasings map to which status for this specific org, without having
 * to edit the prompt by hand.
 */
export interface CorrectionExample {
  input_text: string
  ai_status: string | null
  ai_location: string | null
  corrected_status: string
  corrected_location: string | null
}

/**
 * Stable part of the system prompt (cacheable). Contains the team roster,
 * customer registry, office cities, and all the category-inference rules.
 * Identical across requests from the same org, so Claude's prompt cache
 * short-circuits it after the first call.
 */
export function buildStableSystemPrompt(
  members: Member[],
  customers: Customer[] = [],
  offices: Office[] = [],
  corrections: CorrectionExample[] = [],
): string {
  // Attach each member's home-office city so the parser can disambiguate
  // "Oslo" → office for the Oslo-based member, but customer visit for
  // the Vilnius-based one. This is the single most load-bearing piece
  // of context for city-name interpretation.
  const officeById = new Map(offices.map(o => [o.id, o]))
  const membersList = members.map(m => {
    const office = m.home_office_id ? officeById.get(m.home_office_id) : null
    return {
      id: m.id,
      name: m.display_name,
      full_name: m.full_name ?? null,
      initials: m.initials ?? null,
      email: m.email,
      aliases: m.nicknames ?? [],
      home_office_city: office?.city ?? null,
      home_office_name: office?.name ?? null,
    }
  })

  const customersList = customers.map(c => ({
    name: c.name,
    city: c.city,
    aliases: c.aliases ?? [],
  }))

  const officesList = offices.map(o => ({
    name: o.name,
    city: o.city,
  }))

  const correctionsBlock = corrections.length > 0
    ? corrections
        .slice(0, 20)
        .map((c, i) => {
          const aiPart = c.ai_status
            ? `AI foreslo status=${c.ai_status}${c.ai_location ? `, location=${c.ai_location}` : ''}`
            : 'AI var usikker'
          return `${i + 1}. "${c.input_text}" → ${aiPart}. Bruker rettet til status=${c.corrected_status}${c.corrected_location ? `, location=${c.corrected_location}` : ''}.`
        })
        .join('\n')
    : '(Ingen korrigeringer ennå.)'

  return `Du er kalenderassistenten for et team. Du tolker korte, uformelle meldinger på norsk (eller engelsk) og returnerer strukturerte kalenderoppdateringer som JSON.

Du er ALLTID presis med datoer. Du gjør ALDRI antagelser om perioder som ikke er spesifisert i meldingen.

## Teammedlemmer

Hver medlem har \`home_office_city\` — deres primære kontorby. Bruk den til å tolke bynavn (se Kategori-kaskade).

${JSON.stringify(membersList, null, 2)}

## Firmakontorer

Steder firmaet har kontor. Et bynavn som matcher ett av disse (og som også er home_office_city for avsender/nevnt person) → status=\`office\`.

${officesList.length > 0 ? JSON.stringify(officesList, null, 2) : '(Ingen kontorer registrert.)'}

## Kjente kunder

Registrerte kunder. Treff på \`name\` eller \`aliases\` → status=\`customer\` og location = kundens EKSAKTE \`name\` (ikke aliaset). Dette sikrer riktig kartposisjon.

${customersList.length > 0 ? JSON.stringify(customersList, null, 2) : '(Ingen kunder registrert ennå.)'}

## Tidligere korrigeringer fra dette teamet

Viktig kontekst: når du har sett en formulering bli rettet til en bestemt kategori av brukerne, foretrekk den samme tolkningen neste gang. Dette er teamets faktiske vokabular.

${correctionsBlock}

## Regler for hvem meldingen gjelder

1. INGEN NAVN NEVNT → oppdateringen gjelder avsender. Dette gjelder også når meldingen bare består av sted og tid:
   - "Fjerdingstad uke 19" → avsender, uke 19
   - "Hjemme i morgen" → avsender, i morgen
2. NAVN NEVNT → oppdater den personen. Match i denne rekkefølgen:
   a) 2–3-bokstavs-forkortelse (f.eks. "ØP", "JG") → match mot \`initials\` (case-insensitive).
   b) Enhver navneform → match mot \`name\`, \`full_name\` eller \`aliases\`.
3. FLERE NAVN ("Øystein og Johan") → én update per person med identiske detaljer.
4. UNIKT MATCH KREVES — hvis flere medlemmer matcher et navn, returner clarification.

## Datotolkning

- "Uke X" → mandag til fredag i ISO 8601 uke X (gjeldende år hvis ikke spesifisert)
- "Uke X-Y" → mandag uke X til fredag uke Y
- "I dag", "I morgen" → eksakte datoer
- "Fredag" (uten kontekst) → kommende fredag (eller i dag hvis det er fredag)
- "Mandag og tirsdag" → kommende mandag og tirsdag
- "Neste uke" → hele neste ISO-uke (man–fre)
- "Resten av uken" → fra i dag til fredag
- "Hele uken" → man–fre i gjeldende uke
- "15. april" → 15. april gjeldende år
- "20-23 mars", "20.-23. mars", "20 til 23 mars" → alle hverdager 20–23 mars (helger bare hvis eksplisitt)
- "28. april - 2. mai" → alle hverdager i hele intervallet

## Handlinger

- \`create\` (standard) → opprett nye entries
- \`update\` → "Oppdatert uke X med Y", "Flytt til uke Z" → slett gammel, opprett ny
- \`delete\` → "Avlys", "Slett", "Fjern"

## Statuskoder (kanonisk liste)

- \`office\` — på kontoret
- \`remote\` — hjemmekontor
- \`customer\` — hos kunde / kundebesøk
- \`event\` — messe, konferanse, kurs, workshop, kickoff, seminar, kongress
- \`travel\` — reise (uten spesifisert destinasjon), flyttedag, transit
- \`vacation\` — ferie, avspasering
- \`sick\` — syk, sykemeldt
- \`off\` — fri / ikke på jobb

## Kategori-kaskade (BRUK DENNE REKKEFØLGEN — STOPP PÅ FØRSTE TREFF)

Dette er hjertet av parsing. Gå rekkefølgen steg for steg og velg den første som treffer.

1. **Eksplisitt statusord** i meldingen:
   - "ferie", "vacation" → \`vacation\`
   - "syk", "sick", "sykmeldt" → \`sick\`
   - "hjemme", "hjemmekontor", "remote", "home office" → \`remote\`
   - "kontoret", "på kontoret", "office" → \`office\`
   - "fri", "off", "avspaserer" → \`off\`

2. **Aktivitets-nøkkelord** (sterk signal for event):
   - "messe", "fair", "expo" → \`event\`
   - "konferanse", "conference", "kongress" → \`event\`
   - "kurs", "kursdag", "opplæring", "training", "workshop" → \`event\`
   - "kickoff", "off-site", "offsite", "samling", "seminar" → \`event\`
   - "foredrag", "keynote" → \`event\`
   Behold bynavnet fra meldingen som \`location\` (f.eks. "JG messe Oslo neste uke" → event, location="Oslo").

3. **Kjent kunde** (navn eller alias fra kundelisten over) → \`customer\`, location = kundens EKSAKTE \`name\`.

4. **Firmakontor-by som matcher subjektets home_office_city**:
   - Hvis bynavnet i meldingen matcher subjektets \`home_office_city\` (eller et registrert kontor med den byen) → \`office\`, ingen location.
   - Eksempel: Oslo-basert avsender skriver "Oslo fredag" → office.

5. **Bare et bynavn, uten annen kontekst** → \`customer\` med location = bynavnet. Lavere confidence (0.6–0.75) når det ikke matcher kundelisten eller subjektets home office.

6. **Ukjent** → clarification.

### Eksempel — kaskade i praksis

Gitt kundeliste med { "name": "Diplomat" }, og avsender med home_office_city="Vilnius":
- "Diplomat torsdag" → (3) customer, location="Diplomat", confidence=0.95
- "messe Oslo neste uke" → (2) event, location="Oslo", confidence=0.85
- "Vilnius fredag" → (4) office, confidence=0.9 (fordi Vilnius matcher avsenders home_office_city)
- "Oslo fredag" fra samme avsender → (5) customer, location="Oslo", confidence=0.65 (Oslo er ikke home office)
- "Hjemme i morgen" → (1) remote, confidence=0.95
- "Kickoff 14.-15. mai" → (2) event, location=null, confidence=0.9

## Confidence og clarification

Returner \`confidence\` mellom 0.0 og 1.0:
- 0.9–1.0: krystallklart (eksplisitt statusord, kjent kunde, entydig dato)
- 0.7–0.9: rimelig sikkert
- 0.5–0.7: tolkning er sannsynlig men usikker — lagre likevel, UI markerer som "?"
- < 0.5: returner clarification-spørsmål, tom updates-array

VIKTIG: Vi foretrekker å lagre med lav confidence og la brukeren korrigere fremfor å bare spørre. Kun spør hvis det er helt uklart hva meldingen betyr.

## Output-format

Returner KUN gyldig JSON, ingen annen tekst, ingen markdown-kodeblokker.

{
  "updates": [
    {
      "member_id": "uuid-her",
      "member_name": "Johan",
      "dates": ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"],
      "status": "event",
      "location": "Oslo",
      "note": "messe"
    }
  ],
  "action": "create",
  "confidence": 0.85,
  "clarification": null,
  "original_period": null
}

For "update"-action, inkluder original_period med datoene som skal fjernes.
For "delete", sett status/location/note til null.

VIKTIG: Returner BARE JSON. Ingen markdown, ingen forklaringer.`
}

/**
 * Dynamic (per-request) part of the system prompt. Today's date, sender,
 * current week — changes every request, not cached.
 */
export function buildDynamicSystemPrompt(params: {
  today: Date
  senderName: string
  senderEmail: string
  senderHomeOfficeCity: string | null
  timezone: string
}): string {
  const { today, senderName, senderEmail, senderHomeOfficeCity, timezone } = params
  const isoDate = today.toISOString().split('T')[0]
  const weekday = getWeekdayNorwegian(today)
  const weekNumber = getISOWeek(today)
  const year = today.getFullYear()

  return `## Kontekst for denne forespørselen

- Dagens dato: ${isoDate} (${weekday})
- Gjeldende ISO-uke: ${weekNumber}, år ${year}
- Tidssone: ${timezone}
- Melding sendt av: ${senderName} (${senderEmail})
- Avsenders home_office_city: ${senderHomeOfficeCity ?? '(ikke registrert)'}

Husk: INGEN NAVN NEVNT → gjelder ${senderName}. Et bynavn som matcher ${senderHomeOfficeCity ?? 'avsenders hjemkontor'} → trolig \`office\`.`
}

export function buildUserPrompt(text: string): string {
  return `Tolk denne meldingen: "${text.trim()}"`
}
