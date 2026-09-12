const textos = require("../textosFlows");
const {
  obterPizzas,
  obterPrecosPizzas,
  obterNomesBebidas,
  obterPrecosBebidas
} = require("../cardapio");
const {
  interpretarComGroq,
  interpretarLocalmente
} = require("../../services/groqCardapio.service");
const { normalizar, respostaSim, respostaNao } = require("../../utils/texto");
const { catalogo, ativa } = require("../../services/precos.service");
const { oferecerAdicionais } = require("./adicionais.handler");

function moeda(valor) { return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`; }
function riscar(valor) { return String(valor).split("").map(caractere => caractere + "\u0336").join(""); }

function promocaoChave(promocao) {
  return promocao ? `${promocao.nome || ""}|${promocao.de || ""}|${promocao.por || ""}` : "";
}

function agruparCarrinhoPizzas(itens) {
  const agrupados = [];
  for (const item of itens) {
    const sabores = (item.sabores || [item.sabor]).map(normalizar).sort().join("|");
    const encontrado = agrupados.find(atual =>
      (atual.sabores || [atual.sabor]).map(normalizar).sort().join("|") === sabores &&
      atual.tamanho === item.tamanho && atual.valor === item.valor &&
      promocaoChave(atual.promocao) === promocaoChave(item.promocao)
    );
    if (encontrado) encontrado.quantidade += Number(item.quantidade) || 1;
    else agrupados.push({ ...item, quantidade: Number(item.quantidade) || 1 });
  }
  return agrupados;
}

function agruparCarrinhoBebidas(itens) {
  const agrupados = [];
  for (const item of itens) {
    const encontrado = agrupados.find(atual =>
      normalizar(atual.chave || atual.nome) === normalizar(item.chave || item.nome) &&
      atual.valor === item.valor && promocaoChave(atual.promocao) === promocaoChave(item.promocao)
    );
    if (encontrado) encontrado.quantidade += Number(item.quantidade) || 1;
    else agrupados.push({ ...item, quantidade: Number(item.quantidade) || 1 });
  }
  return agrupados;
}

function formatarRespostaIa(texto) {
  const conteudo = String(texto || "").replace(/\*/g, "").trim();
  return `\`\`\`\n${conteudo}\n\`\`\``;
}

async function tratarPizza({ msg, user, contexto, estoque }) {
  const estado = contexto.estados[user];

  if (estado === "pedido_pizza") {
    const pizzas = obterPizzas();
    const precosPizzas = obterPrecosPizzas();
    const nomesBebidas = obterNomesBebidas();
    const precosBebidas = obterPrecosBebidas();
    await msg.reply("⏳ Processando seu pedido, aguarde um instante...");

    const opcoes = pizzas.map(produto => ({ nome: produto.nome, categoria: produto.categoria }));
    const opcoesBebidas = Object.entries(nomesBebidas).map(([chave, bebida]) => ({
      chave,
      nome: bebida.nome,
      aliases: bebida.aliases || []
    }));
    let interpretacao;
    let interpretacaoBebidas;

    try {
      interpretacaoBebidas = interpretarLocalmente(msg.body, opcoesBebidas, "bebida");
      interpretacao = await interpretarComGroq(msg.body, opcoes, "pizza");
    } catch (erro) {
      console.error(`Erro ao consultar a IA do cardápio: ${erro.message}`);
      await msg.reply(formatarRespostaIa(
        "❌ Não consegui processar seu pedido agora. " +
        "Aguarde um momento e tente novamente."
      ));
      return true;
    }

    // Se algum produto foi mencionado, não montamos um carrinho parcial.
    const pizzaMencionada = interpretarLocalmente(msg.body, opcoes, "pizza").itens.length > 0;
    const erroPizzaObrigatorio = pizzaMencionada && interpretacao.erros.length > 0;
    if (
      erroPizzaObrigatorio ||
      (interpretacao.erros.length && interpretacao.itens.length) ||
      (!interpretacao.itens.length && !interpretacaoBebidas.itens.length)
    ) {
      const erros = erroPizzaObrigatorio || interpretacao.itens.length
        ? interpretacao.erros
        : [...new Set([...interpretacao.erros, ...interpretacaoBebidas.erros])];
      await msg.reply(formatarRespostaIa(
        "🤖 *Não consegui montar o pedido exatamente como você escreveu.*\n\n" +
        "Veja o que precisa ser corrigido:\n" +
        erros.join("\n") +
        "\n\nEnvie o pedido completo novamente.\n\n" +
        textos.exemploPizza
      ));
      return true;
    }

    // O painel controla disponibilidade, não quantidade: valor positivo
    // significa estoque ilimitado e zero significa produto esgotado.
    for (const item of interpretacao.itens) {
      for (const sabor of item.sabores) {
        const chave = normalizar(sabor);
        if (Object.prototype.hasOwnProperty.call(estoque.pizzas || {}, chave) && Number(estoque.pizzas[chave]) <= 0) {
          await msg.reply(formatarRespostaIa(
            `❌ *O produto ${sabor} está indisponível no momento.*\n\nEscolha outro produto disponível no Cardápio Digital.`
          ));
          return true;
        }

        // Todo produto usa o preço unitário U interno e só pode ser vendido
        // quando esse preço estiver cadastrado.
        const valor = Number(precosPizzas[sabor]?.[item.tamanho]);
        if (!Number.isFinite(valor) || valor <= 0) {
          await msg.reply(formatarRespostaIa(
            `❌ *O produto ${sabor} ainda não está disponível no cardápio.*\n\n` +
            "Escolha outro produto com preço exibido no Cardápio Digital."
          ));
          return true;
        }
      }
    }

    for (const bebida of interpretacaoBebidas.itens) {
      if (Object.prototype.hasOwnProperty.call(estoque.bebidas || {}, bebida.chave) && Number(estoque.bebidas[bebida.chave]) <= 0) {
        await msg.reply(formatarRespostaIa(
          `❌ *A bebida ${bebida.nome} está indisponível no momento.*\n\nEscolha outra bebida disponível no Cardápio Digital.`
        ));
        return true;
      }
    }

    const catalogoPromos = catalogo().promocoes || { pizzas: {}, bebidas: {} };
    const categoriaPorProduto = new Map(opcoes.map(produto => [produto.nome, produto.categoria]));
    contexto.carrinhoPizza[user] ||= [];
    contexto.carrinhoBebida[user] ||= [];

    for (const item of interpretacao.itens) {
      contexto.carrinhoPizza[user].push({
        ...item,
        // Mantemos o tipo verdadeiro no pedido. O nome interno ainda usa
        // carrinhoPizza por compatibilidade, mas o painel não deve chamar um
        // combo ou acompanhamento de hambúrguer.
        categoria: categoriaPorProduto.get(item.sabor) || "tradicionais",
        valor: Math.max(...item.sabores.map(sabor => Number(precosPizzas[sabor][item.tamanho]))),
        promocao: item.sabores.map(sabor => catalogoPromos.pizzas?.[sabor]?.[item.tamanho]).find(ativa) || null
      });
    }

    for (const bebida of interpretacaoBebidas.itens) {
      contexto.carrinhoBebida[user].push({
        ...bebida,
        valor: Number(precosBebidas[bebida.chave]),
        promocao: ativa(catalogoPromos.bebidas?.[bebida.chave]) ? catalogoPromos.bebidas[bebida.chave] : null
      });
    }

    // A IA pode devolver o mesmo produto em linhas separadas. Unificamos o
    // carrinho antes de mostrar, cobrar e salvar o pedido.
    contexto.carrinhoPizza[user] = agruparCarrinhoPizzas(contexto.carrinhoPizza[user]);
    contexto.carrinhoBebida[user] = agruparCarrinhoBebidas(contexto.carrinhoBebida[user]);

    let resumo = textos.confirmacaoPizzas;

    for (const pizza of contexto.carrinhoPizza[user]) {
      const subtotal = pizza.quantidade * pizza.valor;
      resumo +=
        `🍔 ${pizza.quantidade}x ${pizza.sabor}` +
        `${pizza.promocao ? `\n   R$ ${riscar(Number(pizza.promocao.de * pizza.quantidade).toFixed(2).replace(".", ","))} por ${moeda(pizza.promocao.por * pizza.quantidade)}` : ` - ${moeda(subtotal)}`}\n\n`;
    }

    for (const bebida of contexto.carrinhoBebida[user]) {
      const subtotal = bebida.quantidade * bebida.valor;
      resumo += `🥤 ${bebida.quantidade}x ${bebida.nome}` +
        `${bebida.promocao ? `\n   R$ ${riscar(Number(bebida.promocao.de * bebida.quantidade).toFixed(2).replace(".", ","))} por ${moeda(bebida.promocao.por * bebida.quantidade)}` : ` - ${moeda(subtotal)}`}\n\n`;
    }

    contexto.estados[user] = "confirmar_pizza";
    await msg.reply(formatarRespostaIa(resumo + textos.confirmarPedido));
    return true;
  }

  if (estado !== "confirmar_pizza") {
    return false;
  }

  if (respostaSim(msg.body)) {
    await oferecerAdicionais(msg, user, contexto);
    return true;
  }

  if (respostaNao(msg.body)) {
    contexto.carrinhoPizza[user] = [];
    contexto.carrinhoBebida[user] = [];
    contexto.estados[user] = "pedido_pizza";
    await msg.reply(textos.comoPedirPizza);
    await msg.reply(textos.linkCardapioDigital, undefined, { linkPreview: false });
    return true;
  }

  await msg.reply(
    `🛒 *Ainda preciso da confirmação do seu carrinho.*

1️⃣ Sim — confirmar o pedido
2️⃣ Não — refazer o pedido`
  );
  return true;
}

module.exports = {
  tratarPizza
};

