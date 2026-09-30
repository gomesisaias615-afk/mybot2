const CACHE = 'mybot-app-v11-visual-moderno-network-first';
const ARQUIVOS = ['/app/', '/app/instalar.html', '/app/style.css', '/app/app.js', '/app/manifest.webmanifest', '/painel/mybot-logo-verde.png'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(async cache => {
    // Um ícone ou arquivo temporariamente indisponível não pode impedir a
    // instalação inteira do aplicativo.
    await Promise.all(ARQUIVOS.map(arquivo => cache.add(arquivo).catch(() => undefined)));
    await self.skipWaiting();
  })
));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const chaves = await caches.keys();
  const antigos = chaves.filter(chave => chave.startsWith('mybot-app-') && chave !== CACHE);
  await Promise.all(antigos.map(chave => caches.delete(chave)));
  await self.clients.claim();
  // Atualiza somente a entrada/instalação, nunca uma edição aberta no painel.
  if (antigos.length) {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(janelas.map(janela => {
      const url = new URL(janela.url);
      if (url.origin === self.location.origin && ['/app', '/app/', '/app/index.html', '/app/instalar.html', '/instalar', '/instalar/', '/instalar/index.html'].includes(url.pathname)) {
        return janela.navigate(janela.url).catch(() => undefined);
      }
    }));
  }
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !(url.pathname === '/app' || url.pathname.startsWith('/app/') || url.pathname === '/instalar' || url.pathname.startsWith('/instalar/'))) return;
  event.respondWith((async () => {
    // Nunca consultar caches globais com versões antigas da interface.
    const chave = url.pathname === '/app' || url.pathname === '/app/index.html' ? '/app/' : url.pathname;
    const guardar = ARQUIVOS.includes(chave);
    try {
      const resposta = await fetch(event.request, { cache: 'no-store' });
      if (resposta.ok && guardar) {
        const copia = resposta.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(chave, copia)).catch(() => undefined));
      }
      return resposta;
    } catch {
      if (guardar) {
        const cache = await caches.open(CACHE);
        const salva = await cache.match(chave);
        if (salva) return salva;
      }
      // Nunca oferecer dados autenticados ou um instalador antigo como fallback.
      return new Response('Conecte-se à internet e abra o MyBot novamente.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
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
