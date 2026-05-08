import type { Entry, EntryStatus } from '@/lib/supabase/types'

/**
 * Når organisasjonen har slått av sykefravær («Skjul syk — vis som «borte»»)
 * mappes status='sick' til 'off' før noe konsumeres av UI. Vi gjør dette
 * sentralt så alle flater (matrise, Akkurat nå, dashboard, antakelser fra
 * presence-defaults) snakker samme språk — uten dette ville en passerende
 * fortsatt kunne se sykt segment via den ene flaten der vi glemte å
 * filtrere.
 */
export function redactSickStatus(
  status: EntryStatus,
  showSick: boolean,
): EntryStatus {
  return showSick || status !== 'sick' ? status : 'off'
}

export function redactSickStatusOrNull(
  status: EntryStatus | null | undefined,
  showSick: boolean,
): EntryStatus | null {
  if (status == null) return null
  return redactSickStatus(status, showSick)
}

/** Map a single entry — returns the same object reference when nothing changes
 *  so React memoization stays cheap. */
export function redactSickEntry<T extends Pick<Entry, 'status'>>(
  entry: T,
  showSick: boolean,
): T {
  if (showSick || entry.status !== 'sick') return entry
  return { ...entry, status: 'off' as EntryStatus }
}

/** Map a list — returns the same array reference when nothing changes. */
export function redactSickEntries<T extends Pick<Entry, 'status'>>(
  entries: T[],
  showSick: boolean,
): T[] {
  if (showSick) return entries
  let dirty = false
  const out = entries.map((e) => {
    if (e.status !== 'sick') return e
    dirty = true
    return { ...e, status: 'off' as EntryStatus }
  })
  return dirty ? out : entries
}
