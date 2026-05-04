// UpWise service worker — Phase 7
//
// Caching strategy:
//   - App shell (HTML/CSS/JS chunks): Cache First with revalidation
//   - Dashboard + transactions data routes: Stale While Revalidate
//   - All other GET requests: Network First → cache fallback
//   - Mutations (non-GET): never cached, fail loudly when offline
//
// Push:
//   - On `push` event, render a notification using payload from server
//   - On `notificationclick`, focus an existing tab or open the target URL

// Bump this when the cache shape needs invalidation. Old caches are
// pruned in `activate`.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `upwise-shell-${CACHE_VERSION}`;
const DATA_CACHE = `upwise-data-${CACHE_VERSION}`;

// Routes whose responses we want to cache for offline view.
const CACHEABLE_DATA_PATHS = [
  '/dashboard',
  '/transactions',
  '/recurring',
  '/goals',
  '/accounts',
];

self.addEventListener('install', () => {
  // Activate this SW immediately on install (skip waiting in update).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) => k.startsWith('upwise-') && !k.endsWith(CACHE_VERSION),
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // Mutations: pass through, never cache.

  const url = new URL(req.url);

  // Same-origin only — let cross-origin (e.g. avatars, third-party CDNs) fall
  // through to the network without our caching policy.
  if (url.origin !== self.location.origin) return;

  // /api/* is network-only — server actions, auth, sync triggers all live
  // here. Caching them would silently serve stale state on refresh.
  if (url.pathname.startsWith('/api/')) return;

  // Stale-while-revalidate for the cacheable read views.
  if (
    CACHEABLE_DATA_PATHS.some(
      (p) => url.pathname === p || url.pathname.startsWith(p + '/'),
    )
  ) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  // App shell (Next chunks, icons, manifest, favicon): Cache First.
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.png' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // Everything else: Network First with cache fallback (and offline page).
  event.respondWith(networkFirst(req, SHELL_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return (
      (await caches.match('/offline.html')) ??
      new Response('Offline', { status: 503 })
    );
  }
}

async function networkFirst(request, cacheName) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return (
      (await caches.match('/offline.html')) ??
      new Response('Offline', { status: 503 })
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((fresh) => {
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  if (cached) {
    // Fire-and-forget the revalidation; return cached immediately.
    networkPromise;
    return cached;
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return (
    (await caches.match('/offline.html')) ??
    new Response('Offline', { status: 503 })
  );
}

// =================== PUSH ===================

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: 'UpWise', body: event.data?.text() ?? '' };
  }

  const title = payload.title ?? 'UpWise';
  const options = {
    body: payload.body ?? '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag, // Same tag → replaces previous notification.
    data: { url: payload.url ?? '/dashboard' },
    dir: 'rtl',
    lang: 'he',
    requireInteraction: payload.requireInteraction ?? false,
    vibrate: payload.vibrate ?? [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/dashboard';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Reuse an existing tab on this origin if one is open.
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              // Some browsers block navigate(); silently ignore.
            }
          }
          return;
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});
