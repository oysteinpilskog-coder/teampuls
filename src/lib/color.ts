// Tiny colour helpers for runtime hue manipulation.
// Kept dependency-free because the dashboard renders these inline during
// every frame of the aurora animation — a big colour library would be
// wasted weight for two conversions.

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break
      case gn: h = (bn - rn) / d + 2; break
      case bn: h = (rn - gn) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = ((h % 360) + 360) % 360 / 360
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    let tn = t
    if (tn < 0) tn += 1
    if (tn > 1) tn -= 1
    if (tn < 1 / 6) return p + (q - p) * 6 * tn
    if (tn < 1 / 2) return q
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
    return p
  }
  return {
    r: hue(hn + 1 / 3) * 255,
    g: hue(hn) * 255,
    b: hue(hn - 1 / 3) * 255,
  }
}

/**
 * Rotate the hue of a hex colour, keeping saturation and lightness intact.
 * 180° yields the direct colour-wheel complement — which maps to the
 * classic aurora pairings (green ↔ magenta, violet ↔ yellow-green).
 */
export function rotateHue(hex: string, degrees: number): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const next = hslToRgb(h + degrees, s, l)
  return rgbToHex(next.r, next.g, next.b)
}

/**
 * Direct complement — 180° around the colour wheel. Pairs that read as two
 * distinct lights rather than one (what the map-pin aurora needs).
 */
export function complement(hex: string): string {
  return rotateHue(hex, 180)
}
