const pagamentoConfig = require("../config/pagamento");
const pagamentoGateway = require("./gateway/pagamento.gateway");
const {
  buscarEnderecoPedido,
  atualizarPagamentoPedido,
  formatarEnderecoAtendente,
  marcarPedidoConcluido
} = require("./enderecoPedido.service");

const {
  confirmarPedidoPago
} = require("./monitoramento/pedidos.service");

const {
  salvarCliente
} = require("./marketing.service");

async function processarWebhookPagamento(body, client) {
  try {
    const resultado = await pagamentoGateway.processarWebhook({
      body,
      config: pagamentoConfig.webhook
    });

    if (!resultado || !resultado.aprovado || !resultado.pedidoId) {
      return;
    }

    const enderecoAntesDaConfirmacao = buscarEnderecoPedido(resultado.pedidoId);
    const totalEsperado = Number(enderecoAntesDaConfirmacao?.totalFinal);
    const valorPago = Number(resultado.valorPago);
    if (
      !Number.isFinite(totalEsperado) ||
      !Number.isFinite(valorPago) ||
      Math.abs(totalEsperado - valorPago) > 0.009
    ) {
      console.error(
        `Pagamento com valor divergente recusado para ${resultado.pedidoId}: ` +
        `esperado R$ ${totalEsperado.toFixed(2)}, recebido R$ ${valorPago.toFixed(2)}`
      );
      return;
    }

        const pedidoPago = confirmarPedidoPago(resultado.pedidoId);

    if (!pedidoPago) {
      console.log("Pagamento ja processado:", resultado.pedidoId);
      return;
    }

    marcarPedidoConcluido(resultado.pedidoId);

        const numeroAtendente = `${String(process.env.ATENDENTE_WHATSAPP || "5514991818867").replace(/\D/g, "")}@c.us`;
    const endereco = atualizarPagamentoPedido(resultado.pedidoId, {
      pagamento: resultado.formaPagamento === "pix" ? "pix" : "cartao_online",
      formaPagamento: resultado.formaPagamento,
      tipoPagamento: resultado.tipoPagamento,
      tipoCartao:
        resultado.tipoPagamento === "credit_card"
          ? "credito"
          : resultado.tipoPagamento === "debit_card"
            ? "debito"
            : null,
      parcelas: resultado.parcelas,
      valorPago: resultado.valorPago,
      pagamentoStatus: "approved"
    }) || buscarEnderecoPedido(resultado.pedidoId);

    let numeroWhatsApp = "";

try {
  const contatoWhatsApp = await client.getContactById(pedidoPago.cliente);

  numeroWhatsApp =
    contatoWhatsApp?.number ||
    contatoWhatsApp?.id?.user ||
    "";
} catch (err) {
  console.log(
    "Nao consegui pegar o numero direto do WhatsApp:",
    err.message
  );
}

salvarCliente(
  pedidoPago.cliente,
  endereco?.contato || numeroWhatsApp
);

        await client.sendMessage(
      numeroAtendente,
      formatarEnderecoAtendente(resultado.pedidoId, endereco, pedidoPago)
    );

            await client.sendMessage(
      pedidoPago.cliente,
      `✅ Pagamento aprovado!

🍕 Pedido: #${resultado.pedidoId}

Recebemos seu pagamento certinho.
Seu pedido logo estará em preparo.

Obrigado pela preferência!`
    );
  } catch (err) {
    console.log("ERRO WEBHOOK PAGAMENTO:", err);
  }
}

module.exports = {
  processarWebhookPagamento
};


