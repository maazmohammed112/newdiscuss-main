/**
 * sw-push.js — Production Service Worker
 *
 * Strategies:
 *   • Navigation (HTML):  Network-first → offline.html fallback
 *   • Static assets:      Cache-first (immutable hashed chunks)
 *   • Firebase / API:     Network-only (never cache — auth depends on live data)
 *   • Fonts:              Cache-first with 30-day expiry
 *
 * Offline behaviour:
 *   • Shows /offline.html for navigation requests when offline
 *   • Cached static assets (JS/CSS/images) work without network
 *   • App shell loads; cached IndexedDB data (posts, chats) renders
 *   • Real-time features degrade gracefully (show stale data)
 *
 * Auth safety:
 *   • Firebase auth/RTDB/Firestore calls are NEVER cached
 *   • HTML is NEVER cached (always fetched fresh = no stale auth state)
 */

const CACHE_VERSION = 'discuss-v5';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const FONT_CACHE    = `${CACHE_VERSION}-fonts`;
const OFFLINE_URL   = '/offline.html';
const APP_ICON      = '/favicon-new.png';

// Pre-cache these on install — critical offline fallbacks only
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  APP_ICON,
  '/manifest.json',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch((err) =>
        console.warn('[SW] Pre-cache error (non-fatal):', err)
      )
    )
  );
  // Take control immediately — don't wait for old SW to finish
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== STATIC_CACHE && n !== FONT_CACHE)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// ─── Message handler ──────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, {
      icon: APP_ICON,
      badge: APP_ICON,
      vibrate: [200, 100, 200],
      ...options,
    });
  }
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // ── 1. Firebase & external API calls — Network-only (never cache) ────────
  const isFirebaseUrl =
    url.hostname.includes('firebaseio.com')       ||
    url.hostname.includes('firebaseapp.com')       ||
    url.hostname.includes('googleapis.com')        ||
    url.hostname.includes('identitytoolkit.google')||
    url.hostname.includes('securetoken.google')    ||
    url.hostname.includes('firebase.com')          ||
    url.hostname.includes('microlink.io')          ||
    url.hostname.includes('generate_204');

  if (isFirebaseUrl) return; // Let browser handle — no SW interception

  // ── 2. Navigation requests (HTML pages) — Network-first ─────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() =>
          // Offline: serve the pre-cached offline page
          caches.match(OFFLINE_URL).then(
            (cached) => cached || new Response('<h1>Offline</h1>', {
              headers: { 'Content-Type': 'text/html' },
            })
          )
        )
    );
    return;
  }

  // ── 3. Google Fonts CSS — Network-first with font cache fallback ─────────
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(FONT_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── 4. Google Fonts files — Cache-first (they're immutable) ─────────────
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(FONT_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── 5. Static assets (hashed chunks) — Cache-first with network fallback ─
  const isHashedStaticAsset =
    url.pathname.match(/\/static\/.+\.(js|css)$/) ||
    url.pathname.match(/\.(woff2?|ttf|eot|otf)$/);

  if (isHashedStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // If Netlify returns an HTML fallback (SPA rewrite) for a missing JS chunk,
          // do NOT cache it! It will cause "Unexpected token '<'".
          const contentType = response.headers.get('content-type') || '';
          if (response.status === 200 && !contentType.includes('text/html')) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            return response;
          } else if (response.status === 200 && contentType.includes('text/html')) {
            // It's a stale chunk request and Netlify gave us index.html.
            // Return 404 so React's lazy loader knows it failed.
            return new Response('Stale chunk', { status: 404 });
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ── 6. Other static assets (images, icons, manifest) — Cache-first ───────
  const isOtherStaticAsset = url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|json)$/);

  if (isOtherStaticAsset && url.hostname === self.location.hostname) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ── 7. All other requests — Network-only ────────────────────────────────
  event.respondWith(
    fetch(request).catch(() => new Response('', { status: 503 }))
  );
});

// ─── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'Discuss',
    body:  'You have a new notification',
    icon:  APP_ICON,
    badge: APP_ICON,
    data:  { url: '/' },
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.warn('[SW] Push data parse error:', e);
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:              data.body,
      icon:              data.icon  || APP_ICON,
      badge:             data.badge || APP_ICON,
      vibrate:           [200, 100, 200],
      tag:               data.tag  || 'discuss-notification',
      renotify:          true,
      requireInteraction: false,
      data:              data.data || { url: '/' },
      actions:           data.actions || [],
    })
  );
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'NOTIFICATION_CLICK', url: urlToOpen });
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(urlToOpen);
      })
  );
});
