'use strict';

const CACHE_PREFIX = 'cci-study-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v11';
const CORE_FILES = [
  './',
  'offline.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'style.css',
  'js/parser.js',
  'js/study.js',
  'js/storage.js',
  'js/native-bridge.bundle.js',
  'js/mobile-study.js',
  'js/app.js',
  'decks/manifest.json'
];

function assetUrl(file) {
  return new URL(file, self.registration.scope).href;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(assetUrl));
    const manifestResponse = await fetch(assetUrl('decks/manifest.json'));
    if (!manifestResponse.ok) throw new Error('Could not precache the deck manifest');
    const deckFiles = await manifestResponse.json();
    if (!Array.isArray(deckFiles)) throw new Error('Invalid deck manifest');
    await cache.addAll(deckFiles.map(file => assetUrl('decks/' + file)));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    const cache = await caches.open(CACHE_NAME);
    const manifestResponse = await cache.match(assetUrl('decks/manifest.json'));
    if (manifestResponse) {
      const deckFiles = await manifestResponse.json();
      if (Array.isArray(deckFiles)) {
        const deckBase = new URL('decks/', self.registration.scope).href;
        const currentDecks = new Set([assetUrl('decks/manifest.json')]);
        deckFiles.filter(file => typeof file === 'string' && !file.includes('/') && !file.includes('..'))
          .forEach(file => currentDecks.add(assetUrl('decks/' + file)));
        const requests = await cache.keys();
        await Promise.all(requests.filter(request => {
          const url = new URL(request.url);
          return url.href.startsWith(deckBase) && !currentDecks.has(url.href);
        }).map(request => cache.delete(request)));
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const deckBase = new URL('decks/', self.registration.scope).href;
    if (url.href.startsWith(deckBase)) {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        if (response.ok) return response;
      } catch (error) {}
      return await cache.match(request) || new Response('Offline and this deck is not cached.', { status: 503, statusText: 'Offline' });
    }
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return await cache.match(request) || await cache.match(assetUrl('offline.html'));
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      return new Response('Offline and this resource is not cached.', { status: 503, statusText: 'Offline' });
    }
  })());
});
