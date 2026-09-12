const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { garantirArquivo } = require("../dadosPersistentes.service");
const pedidosPath = garantirArquivo("pedidos.json", "services/monitoramento/relatorio/pedidos.json", []);

function lerJson(caminho, padrao) {
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    return padrao;
  }
}

function salvarJson(caminho, dados) {
  fs.writeFileSync(caminho, JSON.stringify(dados, null, 2), "utf8");
}

function calcularTotal(pizzas = [], bebidas = [], adicionais = []) {
  let total = 0;

  for (const pizza of pizzas) {
    total += pizza.quantidade * pizza.valor;
  }

  for (const bebida of bebidas) {
    total += bebida.quantidade * bebida.valor;
  }

  for (const adicional of adicionais) {
    total += Number(adicional?.valor) || 0;
  }

  return total;
}

function gerarCodigoPedido(pedidos) {
  const codigosUsados = new Set(pedidos.map(pedido => String(pedido.id)));

  for (let tentativa = 0; tentativa < 200; tentativa++) {
    const codigo = String(crypto.randomInt(10000, 100000));
    if (!codigosUsados.has(codigo)) return codigo;
  }

  throw new Error("Não foi possível gerar um código de pedido disponível.");
}

function criarPedidoPendente(user, pizzas = [], bebidas = [], pagamento, observacaoPizzas = "", adicionais = []) {
  const pedidos = lerJson(pedidosPath, []);

  const pedido = {
    id: gerarCodigoPedido(pedidos),
    cliente: user,
    status: "aguardando_pagamento",
    pagamento,
    observacaoPizzas,
    adicionais,
    pizzas,
    bebidas,
    total: calcularTotal(pizzas, bebidas, adicionais),
    criadoEm: new Date().toISOString(),
    pagoEm: null
  };

  pedidos.push(pedido);
  salvarJson(pedidosPath, pedidos);

  return pedido;
}

function confirmarPedidoPago(pedidoId) {
  const pedidos = lerJson(pedidosPath, []);
  const pedido = pedidos.find(p => p.id === pedidoId);

  if (!pedido) throw new Error("Pedido não encontrado");
  if (pedido.status === "pago") return null;
  if (pedido.status !== "aguardando_pagamento") {
    throw new Error("Pedido não está aguardando pagamento");
  }

  pedido.status = "pago";
  pedido.pagoEm = new Date().toISOString();

  salvarJson(pedidosPath, pedidos);
  return pedido;
}

function confirmarPedidoPagamentoLocal(pedidoId) {
  const pedidos = lerJson(pedidosPath, []);
  const pedido = pedidos.find(p => p.id === pedidoId);

  if (!pedido) throw new Error("Pedido não encontrado");
  if (pedido.pagamentoLocalConfirmado === true) return null;
  if (pedido.status !== "aguardando_pagamento") {
    throw new Error("Pedido não está aguardando confirmação");
  }

  pedido.status = "confirmado";
  pedido.pagamentoLocalConfirmado = true;
  pedido.confirmadoEm = new Date().toISOString();

  salvarJson(pedidosPath, pedidos);
  return pedido;
}

function confirmarPedidoTeste(pedidoId) {
  const pedidos = lerJson(pedidosPath, []);
  const pedido = pedidos.find(item => item.id === pedidoId);
  if (!pedido) throw new Error("Pedido de teste não encontrado");
  pedido.status = "confirmado";
  pedido.testeAutomatico = true;
  pedido.pagamentoLocalConfirmado = true;
  pedido.confirmadoEm = new Date().toISOString();
  pedido.atualizadoEm = pedido.confirmadoEm;
  salvarJson(pedidosPath, pedidos);
  return pedido;
}

module.exports = {
  criarPedidoPendente,
  confirmarPedidoPago,
  confirmarPedidoPagamentoLocal,
  confirmarPedidoTeste
};
