const CACHE = 'mybot-app-v5';
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
  if (event.request.method !== 'GET' || !new URL(event.request.url).pathname.startsWith('/app/')) return;
  event.respondWith(caches.match(event.request).then(cache => cache || fetch(event.request)));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destino = event.notification.data?.url || '/atendente';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
    const aberta = janelas.find(janela => new URL(janela.url).pathname.includes('atendente'));
    if (aberta) return aberta.focus();
    return clients.openWindow(destino);
  }));
});
