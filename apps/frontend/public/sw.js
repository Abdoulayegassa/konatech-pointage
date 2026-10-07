const VERSION = 'inout-employee-shell-v2';
const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const offlinePath = new URL(`offline`, new URL(scopePath, scopeUrl.origin)).pathname;
const cacheName = `${VERSION}:${scopePath}`;
const LEGACY_CACHE_NAMES = new Set(['konatech-public-shell-v1']);
let updateApproved = false;
const optionalPublicAssets = [
  '/brand/inout-favicon.svg',
  '/brand/inout-logo.png',
  '/brand/inout-app-192.png',
  '/brand/inout-app-512.png',
  '/brand/inout-maskable-512.png',
  '/brand/inout-apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const shellResponse = await fetch(offlinePath, { cache: 'reload' });
    if (!shellResponse.ok || shellResponse.redirected || !shellResponse.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`Offline shell unavailable (${shellResponse.status})`);
    }
    await cache.put(offlinePath, shellResponse.clone());
    const html = await shellResponse.clone().text();
    const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g)]
      .map((match) => new URL(match[1], self.location.origin).pathname);
    const requiredAssets = [...new Set(assetPaths)];
    await Promise.all(requiredAssets.map(async (path) => {
      const response = await fetch(path, { cache: 'reload' });
      if (!response.ok) throw new Error(`Offline shell asset unavailable (${path})`);
      await cache.put(path, response);
    }));
    await Promise.allSettled(optionalPublicAssets.map(async (path) => {
      const response = await fetch(path, { cache: 'reload' });
      if (response.ok) await cache.put(path, response);
    }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_OFFLINE_SHELL') {
    event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      const ready = Boolean(await cache.match(offlinePath));
      event.ports?.[0]?.postMessage({ shellReady: ready });
    })());
  }
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    updateApproved = true;
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => LEGACY_CACHE_NAMES.has(name) || (name.endsWith(`:${scopePath}`) && name !== cacheName))
      .map((name) => caches.delete(name)));
    if (updateApproved) await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && (url.pathname === scopePath.slice(0, -1) || url.pathname.startsWith(scopePath))) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(cacheName);
      if (url.pathname !== offlinePath) return Response.redirect(new URL(offlinePath, self.location.origin), 302);
      return await cache.match(offlinePath) || Response.error();
    }));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (optionalPublicAssets.includes(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      await cache.match(request) || await fetch(request)));
  }
});
