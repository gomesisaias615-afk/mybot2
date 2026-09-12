const pagamentoConfig = require("../config/pagamento");
const pagamentoGateway = require("./gateway/pagamento.gateway");


async function gerarPix({ total, user, pedidoId }) {
  return pagamentoGateway.gerarPix({
    total,
    user,
    pedidoId,
    config: pagamentoConfig.pix
  });
}

async function gerarCartao({ total, user, pedidoId }) {
  return pagamentoGateway.gerarCartao({
    total,
    user,
    pedidoId,
    config: pagamentoConfig.cartao
  });
}

module.exports = {
  gerarPix,
  gerarCartao
};
