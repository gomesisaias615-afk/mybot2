const CACHE = 'mybot-app-v3';
const ARQUIVOS = ['/app/', '/app/style.css', '/app/app.js', '/app/manifest.webmanifest', '/painel/mybot-logo-verde.png'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(async cache => {
    // Um ícone ou arquivo temporariamente indisponível não pode impedir a
    // instalação inteira do aplicativo.
    await Promise.all(ARQUIVOS.map(arquivo => cache.add(arquivo).catch(() => undefined)));
    await self.skipWaiting();
  })
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(chaves => Promise.all(chaves.filter(chave => chave !== CACHE).map(chave => caches.delete(chave)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // O worker atende também /instalar/. Assim o Chrome desktop reconhece que
  // a página usada para iniciar a instalação pertence a um app web.
  event.respondWith(caches.match(event.request).then(cache => cache || fetch(event.request)));
});
