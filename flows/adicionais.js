const fs = require("fs");
const { garantirArquivo } = require("../services/dadosPersistentes.service");
const { normalizar } = require("../utils/texto");
const { obterConfiguracaoCardapio } = require("./cardapio");

const caminhoAdicionais = garantirArquivo("adicionais.json", "data/adicionais.json", {});

function lerAdicionais() {
  try {
    const dados = JSON.parse(fs.readFileSync(caminhoAdicionais, "utf8"));
    return dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  } catch {
    return {};
  }
}

function categoriaDoProduto(nome) {
  const categorias = obterConfiguracaoCardapio().pizzasPorCategoria || {};
  for (const [categoria, produtos] of Object.entries(categorias)) {
    if ((produtos || []).some(produto => normalizar(produto) === normalizar(nome))) return categoria;
  }
  return "";
}

function nomeDoItem(item) {
  return item?.sabor || item?.sabores?.[0] || "";
}

function adicionaisDisponiveis(carrinho = []) {
  const cadastrados = lerAdicionais();
  const produtos = new Map();
  for (const item of carrinho) {
    const produto = nomeDoItem(item);
    const categoria = categoriaDoProduto(produto);
    if (!produto || !["tradicionais", "doces"].includes(categoria)) continue;
    const chave = Object.keys(cadastrados).find(nome => normalizar(nome) === normalizar(produto));
    const extras = (chave ? cadastrados[chave] : [])
      .filter(extra => String(extra?.nome || "").trim() && Number(extra?.preco) > 0)
      .map(extra => ({ produto, categoria, nome: String(extra.nome).trim(), valor: Number(extra.preco) }));
    if (extras.length) produtos.set(normalizar(produto), extras);
  }
  return [...produtos.values()].flat();
}

function formatarAdicionais(adicionais) {
  const porProduto = new Map();
  for (const adicional of adicionais) {
    const lista = porProduto.get(adicional.produto) || [];
    lista.push(adicional);
    porProduto.set(adicional.produto, lista);
  }
  const icone = categoria => categoria === "doces" ? "🎁" : "🍔";
  return `✨ *ADICIONAIS DISPONÍVEIS*\n` +
    [...porProduto.entries()].map(([produto, lista]) =>
      `\n${icone(lista[0]?.categoria)} *${produto}*\n${lista.map(item => `   • ${item.nome} — *R$ ${item.valor.toFixed(2).replace(".", ",")}*`).join("\n")}`
    ).join("\n") +
    "\n\n_Digite o adicional junto com o produto._";
}

function palavrasRelevantes(valor) {
  return normalizar(valor).split(" ").filter(palavra => palavra.length >= 3 && !["com", "para", "extra"].includes(palavra));
}

function pontuarCorrespondencia(entrada, valor) {
  const alvo = normalizar(valor);
  if (!alvo) return 0;
  if (entrada.includes(alvo)) return 20;
  const palavras = palavrasRelevantes(alvo);
  const encontradas = palavras.filter(palavra => entrada.includes(palavra));
  if (!encontradas.length) return 0;
  return encontradas.length === palavras.length ? 12 : encontradas.length * 3;
}

function localizarAdicional(texto, adicionais) {
  const entrada = normalizar(texto);
  const candidatos = adicionais.map(adicional => {
    const pontosAdicional = pontuarCorrespondencia(entrada, adicional.nome);
    let pontosProduto = pontuarCorrespondencia(entrada, adicional.produto);
    if (!pontosProduto && adicional.categoria === "doces" && entrada.includes("combo")) pontosProduto = 5;
    if (!pontosProduto && adicional.categoria === "tradicionais" && entrada.includes("hamburguer")) pontosProduto = 5;
    return { adicional, pontosAdicional, pontosProduto, total: pontosAdicional + pontosProduto };
  }).filter(item => item.pontosAdicional > 0 && item.pontosProduto > 0)
    .sort((a, b) => b.total - a.total);

  if (!candidatos.length) return null;
  if (candidatos.length === 1 || candidatos[0].total > candidatos[1].total) return candidatos[0].adicional;
  return null;
}

module.exports = { adicionaisDisponiveis, formatarAdicionais, localizarAdicional };
