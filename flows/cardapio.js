const fs = require("fs");
const { normalizar } = require("../utils/texto");
const { obterPrecosPizzas: precosPizzasPersistentes, obterPrecosBebidas: precosBebidasPersistentes } = require("../services/precos.service");

const { garantirArquivo } = require("../services/dadosPersistentes.service");
const caminhoNomesBebidas = garantirArquivo("nomesbebidas.json", "data/nomesbebidas.json", {});
const caminhoConfiguracao = garantirArquivo("configuracaoCardapio.json", "data/configuracaoCardapio.json", {});

function lerJson(caminho) {
  return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

function obterPrecosPizzas() {
  return precosPizzasPersistentes();
}

function obterConfiguracaoCardapio() {
  return lerJson(caminhoConfiguracao);
}

function obterPizzas() {
  const configuracao = obterConfiguracaoCardapio();
  const categorias = configuracao.categorias || {};
  const temMapeamento = Object.keys(configuracao.pizzasPorCategoria || {}).length > 0;
  const permitidas = new Set(
    Object.entries(configuracao.pizzasPorCategoria || {})
      .filter(([categoria]) => categorias[categoria] !== false)
      .flatMap(([, nomes]) => nomes)
  );
  return Object.keys(obterPrecosPizzas())
    .filter(nome => !temMapeamento || permitidas.has(nome))
    .map(nome => ({ nome }));
}

function obterNomesBebidas() {
  const configuracao = obterConfiguracaoCardapio();
  if (configuracao.categorias?.bebidas === false) return {};
  return lerJson(caminhoNomesBebidas);
}

function obterPrecosBebidas() {
  return precosBebidasPersistentes();
}

function montarCardapioPizzas(estoquePizzas) {
  const pizzas = obterPizzas();
  const precosPizzas = obterPrecosPizzas();
  let texto = "🍕 *CARDÁPIO DE PIZZAS*\n\n";

  for (const pizza of pizzas) {
    const indisponivel = (estoquePizzas[normalizar(pizza.nome)] || 0) <= 0;
    const nome = indisponivel ? `${pizza.nome} - Indisponível` : pizza.nome;
    const precos = precosPizzas[pizza.nome];

    texto += `${indisponivel ? "❌" : "🍕"} *${nome}*\n` +
      `🔸 P: R$ ${Number(precos.P).toFixed(2).replace(".", ",")}\n` +
      `🔸 M: R$ ${Number(precos.M).toFixed(2).replace(".", ",")}\n` +
      `🔸 G: R$ ${Number(precos.G).toFixed(2).replace(".", ",")}\n` +
      `🔸 F: R$ ${Number(precos.F).toFixed(2).replace(".", ",")}\n\n`;
  }

  return texto;
}

function montarCardapioBebidas(estoqueBebidas) {
  const nomesBebidas = obterNomesBebidas();
  const precosBebidas = obterPrecosBebidas();
  let texto = "🥤 *CARDÁPIO DE BEBIDAS*\n\n";

  for (const [chave, bebida] of Object.entries(nomesBebidas)) {
    const indisponivel = (estoqueBebidas[chave] || 0) <= 0;
    const nome = indisponivel ? `${bebida.nome} - Indisponível` : bebida.nome;
    texto += `${indisponivel ? "❌" : "🥤"} *${nome}*\n` +
      `🔸 R$ ${Number(precosBebidas[chave]).toFixed(2).replace(".", ",")}\n\n`;
  }

  return texto;
}

module.exports = {
  obterPizzas,
  obterNomesBebidas,
  obterPrecosPizzas,
  obterPrecosBebidas,
  obterConfiguracaoCardapio,
  montarCardapioPizzas,
  montarCardapioBebidas
};

