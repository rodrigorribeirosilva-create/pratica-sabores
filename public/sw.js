/* Service worker mínimo — deixa o site instalável na tela inicial
   (celular/desktop) sem guardar páginas antigas: tudo vem da rede. */
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
