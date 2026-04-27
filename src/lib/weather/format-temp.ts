/**
 * Hele grader med ekte minustegn (U+2212), ikke bindestrek (U+002D).
 * Designsystemet er strengt på dette — minustegnet skal ha samme
 * vekt og høyde som plusstegnet i tabular figures, og bindestreken
 * ser smal og «typografisk billig» ut ved siden av et stort tall.
 */
export function formatTemp(tempC: number): string {
  const rounded = Math.round(tempC)
  if (rounded < 0) return `−${Math.abs(rounded)}°`
  return `${rounded}°`
}
