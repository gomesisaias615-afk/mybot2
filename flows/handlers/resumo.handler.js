const textos = require("../textosFlows");
const { respostaSim, respostaNao } = require("../../utils/texto");
const { normalizar } = require("../../utils/texto");
const {
  criarLinkCheckout
} = require("../../services/checkoutLink.service");
const {
  criarPedidoPendente
} = require("../../services/monitoramento/pedidos.service");

async function tratarResumo({
  msg,
  user,
  contexto,
  estoque,
  resetarUsuario,
  mostrarMenu
}) {
  if (contexto.estados[user] !== "confirmar_resumo") {
    return false;
  }

  if (respostaSim(msg.body)) {
    const pizzas = contexto.carrinhoPizza[user] || [];
    const bebidas = contexto.carrinhoBebida[user] || [];

    for (const pizza of pizzas) {
      for (const sabor of pizza.sabores || [pizza.sabor]) {
        const chave = normalizar(sabor);
        if (Object.prototype.hasOwnProperty.call(estoque.pizzas || {}, chave) && Number(estoque.pizzas[chave]) <= 0) {
          resetarUsuario(user);
          await msg.reply(
            `❌ *Não foi possível finalizar: ${sabor} está indisponível.*\n\nEscolha outro sabor pelo Cardápio Digital.`
          );
          await mostrarMenu(msg, user);
          return true;
        }
      }
    }

    for (const bebida of bebidas) {
      if (Object.prototype.hasOwnProperty.call(estoque.bebidas || {}, bebida.chave) && Number(estoque.bebidas[bebida.chave]) <= 0) {
        resetarUsuario(user);
        await msg.reply(
          `❌ *Não foi possível finalizar: ${bebida.nome} está indisponível.*\n\nEscolha outra bebida pelo Cardápio Digital.`
        );
        await mostrarMenu(msg, user);
        return true;
      }
    }

    const pedido = criarPedidoPendente(
      user,
      pizzas,
      bebidas,
      "online",
      contexto.observacoesPizza[user] || ""
    );

    const linkCheckout = criarLinkCheckout(pedido.id);

    await msg.reply(
      `✅ Pedido criado com sucesso!

🔐 Código do pedido: ${pedido.id}
💰 Total: R$ ${Number(pedido.total || 0).toFixed(2).replace(".", ",")}

Cadastre o endereço de entrega e escolha a forma de pagamento pelo link:


Após a aprovação, você receberá a confirmação por aqui.`
    );

    // Uma mensagem contendo somente a URL fica clicável e permite a prévia.
    await msg.reply(
      "⏳ Estamos gerando seu link seguro de pagamento. Ele aparecerá logo abaixo em alguns instantes."
    );
    await msg.reply(linkCheckout, undefined, { linkPreview: false });

    resetarUsuario(user);
    return true;
  }

  if (respostaNao(msg.body)) {
    resetarUsuario(user);
    await msg.reply(textos.pedidoCancelado);
    await mostrarMenu(msg, user);
    return true;
  }

  await msg.reply(
    `🧾 *Confirme o resumo do pedido para continuar.*

1️⃣ Sim — continuar
2️⃣ Não — cancelar e refazer`
  );
  return true;
}

module.exports = {
  tratarResumo
};

