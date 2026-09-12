const textos = require("../textosFlows");
const { gerarResumo } = require("../resumo");
const {
  obterNomesBebidas,
  obterPrecosBebidas
} = require("../cardapio");
const {
  interpretarComGroq
} = require("../../services/groqCardapio.service");
const { respostaSim, respostaNao } = require("../../utils/texto");
const { catalogo, ativa } = require("../../services/precos.service");

function moeda(valor) { return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`; }
function riscar(valor) { return String(valor).split("").map(caractere => caractere + "\u0336").join(""); }

function promocaoChave(promocao) {
  return promocao ? `${promocao.nome || ""}|${promocao.de || ""}|${promocao.por || ""}` : "";
}

function agruparCarrinhoBebidas(itens) {
  const agrupados = [];
  for (const item of itens) {
    const encontrado = agrupados.find(atual =>
      String(atual.chave || atual.nome).toLowerCase() === String(item.chave || item.nome).toLowerCase() &&
      atual.valor === item.valor && promocaoChave(atual.promocao) === promocaoChave(item.promocao)
    );
    if (encontrado) encontrado.quantidade += Number(item.quantidade) || 1;
    else agrupados.push({ ...item, quantidade: Number(item.quantidade) || 1 });
  }
  return agrupados;
}

async function mostrarResumo(msg, user, contexto) {
  contexto.estados[user] = "confirmar_resumo";
  await msg.reply(
    gerarResumo(
      user,
      contexto.carrinhoPizza,
      contexto.carrinhoBebida
    )
  );
}

async function tratarBebida({ msg, user, contexto, estoque }) {
  const estado = contexto.estados[user];

  if (estado === "perguntar_bebida") {
    if (respostaSim(msg.body)) {
      contexto.estados[user] = "pedido_bebida";
      await msg.reply(textos.comoPedirBebidas);
      return true;
    }

    if (respostaNao(msg.body)) {
      await mostrarResumo(msg, user, contexto);
      return true;
    }

    await msg.reply(textos.simOuNao);
    return true;
  }

  if (estado === "pedido_bebida") {
    const nomesBebidas = obterNomesBebidas();
    const precosBebidas = obterPrecosBebidas();
    await msg.reply("⏳ Processando seu pedido de bebida, aguarde um instante...");

    const opcoes = Object.entries(nomesBebidas).map(([chave, bebida]) => ({
      chave,
      nome: bebida.nome,
      aliases: bebida.aliases || []
    }));
    let interpretacao;

    try {
      interpretacao = await interpretarComGroq(msg.body, opcoes, "bebida");
    } catch (erro) {
      console.error(`Erro ao consultar Groq para bebidas: ${erro.message}`);
      await msg.reply(
        "❌ Não consegui processar seu pedido agora. " +
        "Aguarde um momento e tente novamente."
      );
      return true;
    }

    if (interpretacao.erros.length) {
      await msg.reply(
        "❌ Não consegui montar seu pedido de bebidas:\n\n" +
        interpretacao.erros.join("\n") +
        "\n\n" +
        textos.exemploBebidas
      );
      return true;
    }

    for (const item of interpretacao.itens) {
      if (Object.prototype.hasOwnProperty.call(estoque.bebidas || {}, item.chave) && Number(estoque.bebidas[item.chave]) <= 0) {
        await msg.reply(
          `❌ *A bebida ${item.nome} está indisponível no momento.*\n\nEscolha outra bebida disponível no Cardápio Digital.`
        );
        return true;
      }
    }

    const promocoes = catalogo().promocoes?.bebidas || {};
    contexto.carrinhoBebida[user] ||= [];

    for (const item of interpretacao.itens) {
      contexto.carrinhoBebida[user].push({
        ...item,
        valor: Number(precosBebidas[item.chave]),
        promocao: ativa(promocoes[item.chave]) ? promocoes[item.chave] : null
      });
    }
    contexto.carrinhoBebida[user] = agruparCarrinhoBebidas(contexto.carrinhoBebida[user]);

    let resumo = textos.confirmacaoBebidas;

    for (const bebida of contexto.carrinhoBebida[user]) {
      const subtotal = bebida.quantidade * bebida.valor;
      resumo +=
        `🥤 ${bebida.quantidade}x ${bebida.nome}` +
        `${bebida.promocao ? `\n   R$ ${riscar(Number(bebida.promocao.de * bebida.quantidade).toFixed(2).replace(".", ","))} por ${moeda(bebida.promocao.por * bebida.quantidade)}` : ` - ${moeda(subtotal)}`}\n\n`;
    }

    contexto.estados[user] = "confirmar_bebida";
    await msg.reply(
      resumo +
      "\nDeseja confirmar?\n\n" +
      "1️⃣ Sim\n" +
      "2️⃣ Não"
    );
    return true;
  }

  if (estado !== "confirmar_bebida") {
    return false;
  }

  if (respostaSim(msg.body)) {
    await mostrarResumo(msg, user, contexto);
    return true;
  }

  if (respostaNao(msg.body)) {
    contexto.carrinhoBebida[user] = [];
    contexto.estados[user] = "pedido_bebida";
    await msg.reply(textos.comoPedirBebidas);
    return true;
  }

  await msg.reply(
    `🛒 *Ainda preciso da confirmação das bebidas.*

1️⃣ Sim — confirmar as bebidas
2️⃣ Não — escolher novamente`
  );
  return true;
}

module.exports = {
  tratarBebida
};

