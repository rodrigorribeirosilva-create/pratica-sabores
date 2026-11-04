/* Apenas torna o painel da Império instalável. Não armazena páginas nem dados. */
self.addEventListener('install', function (event) { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
