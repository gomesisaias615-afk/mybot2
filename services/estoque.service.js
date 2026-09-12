const fs = require("fs");
const path = require("path");

const { garantirArquivo } = require("./dadosPersistentes.service");
const estoquePath = garantirArquivo("estoque.json", "services/monitoramento/estoque.json", { pizzas: {}, bebidas: {}, acompanhamentos: {}, combos: {} });
const precosPizzasPath = garantirArquivo("precospizzas.json", "data/precospizzas.json", {});
const precosBebidasPath = garantirArquivo("precosbebidas.json", "data/precosbebidas.json", {});
const nomesBebidasPath = garantirArquivo("nomesbebidas.json", "data/nomesbebidas.json", {});
const configuracaoCardapioPath = garantirArquivo("configuracaoCardapio.json", "data/configuracaoCardapio.json", {});

const estoque = {
  pizzas: {},
  bebidas: {},
  acompanhamentos: {},
  combos: {}
};

function lerJson(caminho, padrao = {}) {
  try { return JSON.parse(fs.readFileSync(caminho, "utf8")); } catch { return padrao; }
}

function chavePizza(nome) {
  return String(nome || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

// O projeto antigo chama os produtos de "pizzas" internamente. O painel novo
// usa o Tipo como categoria e traduz essa estrutura sem expor a categoria antiga.
function tipoEstoqueProduto(nome) {
  const configuracao = lerJson(configuracaoCardapioPath, {});
  const categoria = Object.entries(configuracao.pizzasPorCategoria || {})
    .find(([, nomes]) => Array.isArray(nomes) && nomes.includes(nome))?.[0];
  if (categoria === "especiais") return "acompanhamentos";
  if (categoria === "doces") return "combos";
  return "pizzas";
}

// Estoque é controle de disponibilidade: 1 = disponível e 0 = esgotado.
// Assim, itens novos aparecem no painel sem inventar uma quantidade física.
function sincronizarCatalogo(dados) {
  dados.pizzas = dados.pizzas || {};
  dados.bebidas = dados.bebidas || {};
  dados.acompanhamentos = dados.acompanhamentos || {};
  dados.combos = dados.combos || {};
  let mudou = false;
  for (const nome of Object.keys(lerJson(precosPizzasPath))) {
    const chave = chavePizza(nome);
    const tipo = tipoEstoqueProduto(nome);
    if (!Object.prototype.hasOwnProperty.call(dados[tipo], chave)) { dados[tipo][chave] = 1; mudou = true; }
  }
  const bebidas = new Set([...Object.keys(lerJson(precosBebidasPath)), ...Object.keys(lerJson(nomesBebidasPath))]);
  for (const chave of bebidas) {
    if (!Object.prototype.hasOwnProperty.call(dados.bebidas, chave)) { dados.bebidas[chave] = 1; mudou = true; }
  }
  return mudou;
}

function recarregarEstoque() {
  try {
    const dados = JSON.parse(
      fs.readFileSync(estoquePath, "utf8")
    );

    if (sincronizarCatalogo(dados)) fs.writeFileSync(estoquePath, JSON.stringify(dados, null, 2), "utf8");
    estoque.pizzas = dados.pizzas || {};
    estoque.bebidas = dados.bebidas || {};
    estoque.acompanhamentos = dados.acompanhamentos || {};
    estoque.combos = dados.combos || {};
  } catch (err) {
    console.error("Erro ao carregar estoque:", err.message);
  }

  return estoque;
}

function normalizar(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sem registro de estoque, o produto continua vendável. Um registro explícito
// com zero é o que o torna indisponível no bot e no cardápio.
function produtoDisponivel(tipo, chave) {
  const itens = estoque[tipo] || {};
  return !Object.prototype.hasOwnProperty.call(itens, chave) || Number(itens[chave]) > 0;
}

function zerarProduto(nomeInformado) {
  const dados = JSON.parse(fs.readFileSync(estoquePath, "utf8"));
  dados.pizzas = dados.pizzas || {};
  dados.bebidas = dados.bebidas || {};
  dados.acompanhamentos = dados.acompanhamentos || {};
  dados.combos = dados.combos || {};
  const procurado = normalizar(nomeInformado);
  const encontrados = [];

  for (const tipo of ["pizzas", "bebidas", "acompanhamentos", "combos"]) {
    for (const chave of Object.keys(dados[tipo])) {
      if (normalizar(chave) === procurado) encontrados.push({ tipo, chave });
    }
  }

  if (encontrados.length !== 1) return { sucesso: false, encontrados };
  const produto = encontrados[0];
  const quantidadeAnterior = Number(dados[produto.tipo][produto.chave]) || 0;
  dados[produto.tipo][produto.chave] = 0;
  fs.writeFileSync(estoquePath, JSON.stringify(dados, null, 2), "utf8");
  recarregarEstoque();
  return { sucesso: true, ...produto, quantidadeAnterior };
}

function atualizarProdutos(operacoes) {
  const dados = JSON.parse(fs.readFileSync(estoquePath, "utf8"));
  dados.pizzas = dados.pizzas || {};
  dados.bebidas = dados.bebidas || {};
  dados.acompanhamentos = dados.acompanhamentos || {};
  dados.combos = dados.combos || {};
  const aplicadas = [];
  for (const operacao of operacoes || []) {
    if (!Object.prototype.hasOwnProperty.call(dados[operacao.tipo] || {}, operacao.chave)) throw new Error("Item inexistente no estoque: " + operacao.chave);
    const anterior = Math.max(0, Number(dados[operacao.tipo][operacao.chave]) || 0);
    const atual = operacao.acao === "zerar" ? 0 : anterior + Math.max(1, Number(operacao.quantidade) || 0);
    dados[operacao.tipo][operacao.chave] = atual;
    aplicadas.push({ ...operacao, anterior, atual });
  }
  fs.writeFileSync(estoquePath, JSON.stringify(dados, null, 2), "utf8");
  recarregarEstoque();
  return aplicadas;
}

function definirQuantidadeProduto(tipo, chave, quantidade) {
  if (!["pizzas", "bebidas", "acompanhamentos", "combos"].includes(tipo)) throw new Error("Tipo de produto inválido.");
  const valor = Number(quantidade);
  if (!Number.isInteger(valor) || valor < 0 || valor > 10000) {
    throw new Error("A quantidade deve ser um número inteiro entre 0 e 10000.");
  }
  const dados = JSON.parse(fs.readFileSync(estoquePath, "utf8"));
  dados.pizzas = dados.pizzas || {};
  dados.bebidas = dados.bebidas || {};
  dados.acompanhamentos = dados.acompanhamentos || {};
  dados.combos = dados.combos || {};
  if (!Object.prototype.hasOwnProperty.call(dados[tipo], chave)) throw new Error("Produto não encontrado no estoque.");
  dados[tipo][chave] = valor;
  fs.writeFileSync(estoquePath, JSON.stringify(dados, null, 2), "utf8");
  recarregarEstoque();
  return valor;
}
recarregarEstoque();

module.exports = {
  estoque,
  recarregarEstoque,
  zerarProduto,
  atualizarProdutos,
  definirQuantidadeProduto,
  produtoDisponivel,
  sincronizarCatalogoEstoque: recarregarEstoque
};

