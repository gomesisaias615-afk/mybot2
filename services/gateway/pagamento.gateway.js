const {
  MercadoPagoConfig,
  Payment,
  Preference
} = require("mercadopago");

function pegarCredenciais(config) {
  const credenciais = config?.credenciais || {};
  const accessToken = credenciais.accessToken;

  if (!accessToken || accessToken.includes("COLE_AQUI")) {
    throw new Error("Access Token do Mercado Pago nao configurado.");
  }

  return credenciais;
}

function criarCliente(config) {
  const credenciais = pegarCredenciais(config);

  return new MercadoPagoConfig({
    accessToken: credenciais.accessToken,
    options: {
      timeout: 10000
    }
  });
}

function emailComprador(user, config) {
  const credenciais = config?.credenciais || {};
  const numero = String(user || "").replace(/\D/g, "");

  return credenciais.payerEmailPadrao || `cliente-${numero || "pedido"}@example.com`;
}

async function gerarPix({ total, user, pedidoId, config }) {
  const credenciais = pegarCredenciais(config);
  const payment = new Payment(criarCliente(config));

  const pagamento = await payment.create({
    body: {
      transaction_amount: Number(total),
      description: `Pedido ${pedidoId}`,
      payment_method_id: "pix",
      external_reference: pedidoId,
      notification_url: credenciais.webhookUrl,
      payer: {
        email: emailComprador(user, config)
      }
    },
    requestOptions: {
      idempotencyKey: `pix-${pedidoId}`
    }
  });

  const dadosPix = pagamento.point_of_interaction?.transaction_data || {};

  return {
    id: pagamento.id,
    pagamentoId: pagamento.id,
    status: pagamento.status,
    copiaCola: dadosPix.qr_code,
    qrCodeBase64: dadosPix.qr_code_base64,
    ticketUrl: dadosPix.ticket_url
  };
}

async function gerarCartao({ total, user, pedidoId, config }) {
  const credenciais = pegarCredenciais(config);
  const preference = new Preference(criarCliente(config));

  const preferencia = await preference.create({
    body: {
      external_reference: pedidoId,
      notification_url: credenciais.webhookUrl,
      items: [
        {
          id: pedidoId,
          title: `Pedido ${pedidoId}`,
          quantity: 1,
          unit_price: Number(total),
          currency_id: "BRL"
        }
      ],
      payer: {
        email: emailComprador(user, config)
      },
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" },
          { id: "bank_transfer" }
        ],
        installments: 12
      }
    },
    requestOptions: {
      idempotencyKey: `cartao-${pedidoId}`
    }
  });

  return {
    id: preferencia.id,
    link: preferencia.init_point || preferencia.sandbox_init_point
  };
}

async function processarWebhook({ body, config }) {
  const pagamentoId =
    body?.data?.id ||
    body?.id ||
    String(body?.resource || "").split("/").pop();

  if (!pagamentoId) {
    return {
      aprovado: false,
      pedidoId: null,
      pagamentoId: null
    };
  }

  const payment = new Payment(criarCliente(config));
  const pagamento = await payment.get({ id: pagamentoId });

  return {
    aprovado: pagamento.status === "approved",
    pedidoId: pagamento.external_reference || null,
    pagamentoId: pagamento.id,
    formaPagamento: pagamento.payment_method_id || null,
    tipoPagamento: pagamento.payment_type_id || null,
    parcelas: Number(pagamento.installments || 1),
    valorPago: Number(pagamento.transaction_amount || 0)
  };
}

module.exports = {
  gerarPix,
  gerarCartao,
  processarWebhook
};


