/**
 * TeamPulse service worker
 *
 * Strategy:
 *   - Same-origin navigation requests → network-first with a stale-if-offline
 *     fallback. Pages render live data when online and keep showing the last
 *     successful load when a connection drops.
 *   - Same-origin static assets (scripts, styles, fonts, images) → cache-first
 *     with a background refresh. Cuts repeat-load time to zero.
 *   - Everything else (Supabase, Claude, third parties) → pass-through so we
 *     never interfere with auth, realtime, or live query responses.
 *
 * The CACHE_VERSION moves forward on every deploy — old caches purge on
 * activate so we never serve stale JS after a release.
 */

const CACHE_VERSION = 'v1'
const PAGES_CACHE = `teampulse-pages-${CACHE_VERSION}`
const STATIC_CACHE = `teampulse-static-${CACHE_VERSION}`
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE)
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' })).catch(() => {})
      self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin

  // Pass-through for everything else
  if (!sameOrigin) return

  // Never cache Supabase auth callbacks, API routes, or realtime WebSocket.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // Navigations → network-first, offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req))
    return
  }

  // Static assets → cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(req))
  }
})

async function networkFirst(req) {
  try {
    const fresh = await fetch(req)
    const cache = await caches.open(PAGES_CACHE)
    cache.put(req, fresh.clone()).catch(() => {})
    return fresh
  } catch {
    const cached = await caches.match(req)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    if (offline) return offline
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) {
    // Refresh in the background so next load has fresh bytes.
    fetch(req)
      .then((fresh) => caches.open(STATIC_CACHE).then((c) => c.put(req, fresh)))
      .catch(() => {})
    return cached
  }
  try {
    const fresh = await fetch(req)
    const cache = await caches.open(STATIC_CACHE)
    cache.put(req, fresh.clone()).catch(() => {})
    return fresh
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

function isStaticAsset(path) {
  return (
    path.startsWith('/_next/static/') ||
    path.startsWith('/icons/') ||
    path.startsWith('/fonts/') ||
    /\.(?:js|css|woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|avif|ico|json|webmanifest)$/.test(path)
  )
}

// iOS Safari doesn't fire beforeinstallprompt, so we don't broadcast an
// "installable" event here. The Add to Home Screen nudge in the client
// detects standalone mode on its own.
