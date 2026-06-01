import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeId, type ThemeId } from '@/lib/themes'

/** Pre-hydration script: apply the user's saved theme override if present,
 *  otherwise fall back to the org-wide default. Baked into <head> so the
 *  very first paint already has the right data-theme — no flash.
 *
 *  Lives in a server-safe module (no 'use client') so the root layout can
 *  call it during SSR. Exporting a function from a 'use client' module turns
 *  it into a client reference that throws when invoked on the server. */
export function themeVariantBootScript(orgDefault: ThemeId): string {
  const fallback = isThemeId(orgDefault) ? orgDefault : DEFAULT_THEME
  return `
(function(){try{
  var k='${THEME_STORAGE_KEY}';
  var v=localStorage.getItem(k);
  var allowed=['nordic','obsidian','aurora','crystal','ember','sakura','forest','monaco','champagne'];
  if(!v||allowed.indexOf(v)===-1)v='${fallback}';
  document.documentElement.setAttribute('data-theme',v);
}catch(e){}})();
`.trim()
}
