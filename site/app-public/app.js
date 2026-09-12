const form = document.querySelector('#loginForm');
const portais = document.querySelector('#portais');
const erro = document.querySelector('#erro');

function mostrarPortais() {
  form.hidden = true;
  portais.hidden = false;
}

async function verificarSessao() {
  const resposta = await fetch('/api/app/sessao', { cache: 'no-store' });
  const dados = await resposta.json();
  if (dados.autenticado) mostrarPortais();
  else if (!dados.configurado) erro.textContent = 'Acesso ainda não configurado no servidor.';
}

form.addEventListener('submit', async evento => {
  evento.preventDefault();
  erro.textContent = '';
  const botao = form.querySelector('button');
  botao.disabled = true;
  botao.textContent = 'Validando...';
  try {
    const resposta = await fetch('/api/app/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: document.querySelector('#token').value })
    });
    if (!resposta.ok) throw new Error('Token inválido.');
    document.querySelector('#token').value = '';
    mostrarPortais();
  } catch (e) {
    erro.textContent = e.message || 'Não foi possível validar o token.';
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

document.querySelector('#sair').addEventListener('click', async () => {
  await fetch('/api/app/sair', { method: 'POST' });
  portais.hidden = true;
  form.hidden = false;
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');
verificarSessao();
