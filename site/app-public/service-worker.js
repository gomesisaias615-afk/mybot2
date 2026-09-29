const CACHE = 'mybot-app-v7-ios';
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
const BADGE_CACHE = 'mybot-push-badge-v1';
const BADGE_KEY = new Request('/__mybot_notification_count__');

async function atualizarNumeroDoIcone(limpar = false) {
  if (!self.navigator?.setAppBadge && !self.navigator?.clearAppBadge) return;
  try {
    const cache = await caches.open(BADGE_CACHE);
    const anterior = await cache.match(BADGE_KEY);
    const atual = anterior ? Number(await anterior.text()) || 0 : 0;
    const total = limpar ? 0 : atual + 1;
    if (limpar) {
      await cache.delete(BADGE_KEY);
      await self.navigator.clearAppBadge?.();
    } else {
      await cache.put(BADGE_KEY, new Response(String(total)));
      await self.navigator.setAppBadge?.(total);
    }
  } catch { /* o aviso continua funcionando mesmo sem contador no sistema */ }
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destino = event.notification.data?.url || '/app/painel/atendente';
  event.waitUntil(Promise.all([
    atualizarNumeroDoIcone(true),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
      const aberta = janelas.find(janela => new URL(janela.url).pathname.includes('atendente'));
      if (aberta) return aberta.focus();
      return clients.openWindow(destino);
    })
  ]));
});

self.addEventListener('push', event => {
  let dados = {};
  try { dados = event.data?.json() || {}; } catch { dados = { body: event.data?.text() }; }
  event.waitUntil(Promise.all([
    atualizarNumeroDoIcone(),
    self.registration.showNotification(dados.title || 'Novo pedido MyBot', {
      body: dados.body || 'Um novo pedido chegou.',
      icon: '/painel/mascote-saborear.png',
      badge: '/painel/mascote-saborear.png',
      tag: dados.tag || 'novo-pedido',
      renotify: true,
      data: { url: dados.url || '/app/painel/atendente' }
    })
  ]));
});