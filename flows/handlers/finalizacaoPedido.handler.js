const {
  salvarEnderecoPedido
} = require("../../services/enderecoPedido.service");
const {
  criarPedidoPendente
} = require("../../services/monitoramento/pedidos.service");
const {
  criarLinkCheckout
} = require("../../services/checkoutLink.service");
const textos = require("../textosFlows");
const { normalizar } = require("../../utils/texto");

function tipoPagamento(texto) {
  const opcao = normalizar(texto);

  if (["1", "pix"].includes(opcao)) return "pix";
  if (["2", "cartao"].includes(opcao)) return "cartao";
  return null;
}

async function finalizarPedido({
  msg,
  user,
  contexto,
  estoque,
  resetarUsuario,
  mostrarMenu
}) {
  if (contexto.estados[user] !== "pagamento_tipo") {
    return false;
  }

  const tipo = tipoPagamento(msg.body);

  if (!tipo) {
    await msg.reply(textos.pagamentoInvalido);
    return true;
  }

  const pizzas = contexto.carrinhoPizza[user] || [];
  const bebidas = contexto.carrinhoBebida[user] || [];

  if (!pizzas.length && !bebidas.length) {
    resetarUsuario(user);
    await msg.reply("Nenhum pedido encontrado.");
    await mostrarMenu(msg, user);
    return true;
  }

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

  contexto.pagamentos[user] = tipo;

  const pedido = criarPedidoPendente(
    user,
    pizzas,
    bebidas,
    tipo,
    contexto.observacoesPizza[user] || ""
  );

  salvarEnderecoPedido(
    pedido.id,
    user,
    contexto.enderecos[user]
  );

  const linkCheckout = criarLinkCheckout(pedido.id, tipo);

  await msg.reply(
    `✅ Pedido criado com sucesso!

🔐 Código do pedido: ${pedido.id}
💰 Total: R$ ${Number(pedido.total || 0).toFixed(2)}

Finalize seu pagamento online pelo link abaixo:


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

module.exports = {
  finalizarPedido
};

