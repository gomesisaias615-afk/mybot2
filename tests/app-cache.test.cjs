const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const worker = fs.readFileSync(path.join(__dirname, '../site/app-public/service-worker.js'), 'utf8');
const CURRENT = 'mybot-app-v11-visual-moderno-network-first';
function ambiente() {
  const eventos = {}, bancos = new Map(), navegadas = [], requisicoes = [];
  let offline = false;
  const cache = nome => {
    if (!bancos.has(nome)) bancos.set(nome, new Map());
    const dados = bancos.get(nome);
    return {
      add: async chave => dados.set(chave, new Response('moderno')),
      put: async (chave, resposta) => dados.set(chave, resposta.clone()),
      match: async chave => dados.get(chave)?.clone()
    };
  };
  const self = {
    location: { origin: 'https://mybot.test' },
    addEventListener: (nome, funcao) => eventos[nome] = funcao,
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => ['/app/', '/app/instalar.html', '/app/painel/adm', '/app/painel/atendente'].map(rota => ({
        url: 'https://mybot.test' + rota,
        navigate: async url => navegadas.push(url)
      }))
    }
  };
  vm.runInNewContext(worker, {
    self, URL, Response, Request: class { constructor(url) { this.url = url; } },
    caches: { open: async nome => cache(nome), keys: async () => [...bancos.keys()], delete: async nome => bancos.delete(nome) },
    fetch: async (req, opcoes) => {
      requisicoes.push(opcoes);
      if (offline) throw Error('offline');
      return new Response('moderno publicado');
    }
  });
  return {
    eventos, bancos, cache, navegadas, requisicoes,
    offline: () => offline = true,
    executar: async nome => { const tarefas=[];eventos[nome]({waitUntil:p=>tarefas.push(p)});await Promise.all(tarefas); },
    buscar: async (rota, method='GET') => {
      const tarefas=[];let resposta;
      eventos.fetch({request:{url:'https://mybot.test'+rota,method},respondWith:p=>resposta=p,waitUntil:p=>tarefas.push(p)});
      const resultado=await resposta;await Promise.all(tarefas);return resultado;
    }
  };
}
test('migração limpa somente caches antigos de interface e preserva notificações', async () => {
  const a=ambiente();
  await a.cache('mybot-app-v10-abertura-clara').put('/app/',new Response('antigo'));
  a.cache(CURRENT);a.cache('mybot-push-badge-v1');a.cache('outro-app');
  await a.executar('activate');
  assert(!a.bancos.has('mybot-app-v10-abertura-clara'));
  assert(a.bancos.has(CURRENT));assert(a.bancos.has('mybot-push-badge-v1'));assert(a.bancos.has('outro-app'));
  assert.deepEqual(a.navegadas,['https://mybot.test/app/','https://mybot.test/app/instalar.html']);
});
test('online sempre busca HTML, CSS e instalador publicados, mesmo com cache', async () => {
  const a=ambiente();
  for(const rota of ['/app/','/app/style.css','/app/instalar.html']) {
    await a.cache(CURRENT).put(rota,new Response('copia antiga'));
    assert.equal(await (await a.buscar(rota)).text(),'moderno publicado');
    assert.equal(await (await a.cache(CURRENT).match(rota)).text(),'moderno publicado');
  }
  assert(a.requisicoes.every(r=>r.cache==='no-store'));
});
test('offline permite apenas a interface da versão atual', async () => {
  const a=ambiente();a.offline();
  await a.cache('mybot-app-v10-abertura-clara').put('/app/',new Response('antigo'));
  assert.equal((await a.buscar('/app/')).status,503);
  await a.cache(CURRENT).put('/app/',new Response('moderno'));
  assert.equal(await (await a.buscar('/app/')).text(),'moderno');
  assert.equal(await (await a.buscar('/app/index.html?v=novo')).text(),'moderno');
});
test('painéis autenticados não são armazenados nem reaparecem offline', async () => {
  const a=ambiente();
  await a.buscar('/app/painel/adm');a.offline();
  assert.equal((await a.buscar('/app/painel/adm')).status,503);
});
test('APIs, POST e páginas externas ao app não são interceptadas', async () => {
  const a=ambiente();
  assert.equal(await a.buscar('/api/painel/dados'),undefined);
  assert.equal(await a.buscar('/app/','POST'),undefined);
  assert.equal(await a.buscar('/cardapio/'),undefined);
  assert.equal(typeof a.eventos.push,'function');
  assert.equal(typeof a.eventos.notificationclick,'function');
});
test('instalação mantém somente os recursos públicos modernos no cache atual', async () => {
  const a=ambiente();await a.executar('install');
  assert.equal(await (await a.cache(CURRENT).match('/app/instalar.html')).text(),'moderno');
});
