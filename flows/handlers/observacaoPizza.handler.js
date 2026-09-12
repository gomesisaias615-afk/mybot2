const { respostaSim, respostaNao } = require("../../utils/texto");
const { gerarResumo } = require("../resumo");

async function seguirParaResumo(msg, user, contexto) {
  contexto.estados[user] = "confirmar_resumo";
  await msg.reply(
    gerarResumo(user, contexto.carrinhoPizza, contexto.carrinhoBebida)
  );
}

async function tratarObservacaoPizza({ msg, user, contexto }) {
  const estado = contexto.estados[user];

  if (estado === "perguntar_observacao_pizza") {
    if (respostaSim(msg.body)) {
      contexto.estados[user] = "digitar_observacao_pizza";
      await msg.reply(
        `✍️ *Digite agora a observação das suas pizzas.*

Exemplo: "Retirar a cebola da pizza de Calabresa."

Envie somente a observação em uma única mensagem.`
      );
      return true;
    }

    if (respostaNao(msg.body)) {
      contexto.observacoesPizza[user] = "";
      await seguirParaResumo(msg, user, contexto);
      return true;
    }

    await msg.reply("Por favor, responda com 1 para Sim ou 2 para Não.");
    return true;
  }

  if (estado !== "digitar_observacao_pizza") return false;

  const observacao = String(msg.body || "").trim();
  if (!observacao) {
    await msg.reply("A observação não pode ficar vazia. Digite a informação desejada.");
    return true;
  }
  if (observacao.length > 300) {
    await msg.reply("A observação deve ter no máximo 300 caracteres. Envie uma versão mais curta.");
    return true;
  }

  contexto.observacoesPizza[user] = observacao;
  await msg.reply(`✅ *Observação adicionada ao pedido:*

“${observacao}”`);
  await seguirParaResumo(msg, user, contexto);
  return true;
}

module.exports = { tratarObservacaoPizza };

