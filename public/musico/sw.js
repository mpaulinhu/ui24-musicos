// Service worker minimo: so o suficiente para o navegador considerar o app
// "instalavel" (PWA) e abrir rapido/offline como concha (o mix ao vivo
// sempre precisa de rede de verdade, isso aqui nao cacheia dados da mesa).
const CACHE = 'mixdefone-v8';
const ASSETS = ['/musico', '/musico/index.html', '/musico/style.css?v=8', '/musico/app.js?v=8', '/musico/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Rede primeiro (sempre pega a versao mais nova); so usa cache se estiver offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
