const CACHE = 'mybot-app-v1';
const ARQUIVOS = ['/app/', '/app/style.css', '/app/app.js', '/app/manifest.webmanifest', '/painel/mybot-logo-verde.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ARQUIVOS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !new URL(event.request.url).pathname.startsWith('/app/')) return;
  event.respondWith(caches.match(event.request).then(cache => cache || fetch(event.request)));
});
