const fs = require("fs");
const path = require("path");

const { garantirArquivo } = require("./dadosPersistentes.service");
const enderecosPath = garantirArquivo("enderecosPedidos.json", "services/monitoramento/relatorio/enderecosPedidos.json", {});

function lerEnderecos() {
  try {
    return JSON.parse(fs.readFileSync(enderecosPath, "utf8"));
  } catch {
    return {};
  }
}

function salvarEnderecos(dados) {
  fs.writeFileSync(
    enderecosPath,
    JSON.stringify(dados, null, 2),
    "utf8"
  );
}

function salvarEnderecoPedido(pedidoId, user, endereco) {
  const enderecos = lerEnderecos();

  enderecos[pedidoId] = {
    cliente: user,
    contato: endereco?.contato || "",
    rua: endereco?.rua || "",
    numero: endereco?.numero || "",
    bairro: endereco?.bairro || "",
    complemento: endereco?.complemento || "Sem complemento",
    referencia: endereco?.referencia || "Sem referencia",
    criadoEm: new Date().toISOString(),
    // Campos adicionais são usados pelo checkout e pelo gerador de testes.
    ...(endereco && typeof endereco === "object" ? endereco : {})
  };

  salvarEnderecos(enderecos);
}

function buscarEnderecoPedido(pedidoId) {
  const enderecos = lerEnderecos();
  return enderecos[pedidoId] || null;
}

function excluirEnderecoPedido(pedidoId) {
  const enderecos = lerEnderecos();
  if (!Object.prototype.hasOwnProperty.call(enderecos, pedidoId)) return false;
  delete enderecos[pedidoId];
  salvarEnderecos(enderecos);
  console.log("Endereco temporario excluido:", pedidoId);
  return true;
}
function atualizarPagamentoPedido(pedidoId, pagamento) {
  const enderecos = lerEnderecos();

  if (!enderecos[pedidoId]) return null;

  Object.assign(enderecos[pedidoId], pagamento, {
    pagamentoAtualizadoEm: new Date().toISOString()
  });
  salvarEnderecos(enderecos);
  return enderecos[pedidoId];
}
function marcarPedidoConcluido(pedidoId) {
  const enderecos = lerEnderecos();

  if (!enderecos[pedidoId]) return;

  enderecos[pedidoId].concluidoEm = new Date().toISOString();

  salvarEnderecos(enderecos);
}

function formatarValor(valor) {
  return Number(valor || 0).toFixed(2).replace(".", ",");
}

function nomeTamanho(tamanho) {
  const tamanhos = {
    P: "Pequena",
    M: "Média",
    G: "Grande",
    F: "Família"
  };

  return tamanhos[String(tamanho || "").toUpperCase()] || tamanho;
}

function formatarEnderecoAtendente(pedidoId, endereco, pedido) {
  if (!endereco) {
    return `✅ PAGAMENTO CONFIRMADO\n\nPedido: ${pedidoId}\n\n⚠️ Endereço não encontrado.`;
  }

  const dataPedido = endereco.concluidoEm || endereco.atualizadoEm || new Date();
  const horarioPedido = new Date(dataPedido).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo"
  });
  const modalidade = endereco.modalidade || "entrega";

  let texto = "";

  texto += "✅ *NOVO PEDIDO CONFIRMADO*\n";
  texto += "━━━━━━━━━━━━━━━━━━━━\n\n";
  texto += `🍕 Pedido: ${pedidoId}\n`;
  texto += `👤 Cliente: ${endereco.nome || endereco.cliente}\n`;
  texto += `📦 Modalidade: ${
    modalidade === "salao"
      ? "Salão"
      : modalidade === "retirada"
        ? "Retirada"
        : "Entrega"
  }\n`;
  const pagamento = endereco.pagamento || pedido?.pagamento || "online";
  const tipoCartao = endereco.tipoCartao === "credito"
    ? "Crédito"
    : endereco.tipoCartao === "debito"
      ? "Débito"
      : endereco.tipoPagamento === "credit_card"
        ? "Crédito"
        : endereco.tipoPagamento === "debit_card"
          ? "Débito"
          : "";

  texto += "\n⚠️ *PAGAMENTO*\n";
  texto += pagamento === "dinheiro"
    ? "💵 Forma: DINHEIRO\n"
    : pagamento === "maquininha"
      ? "💳 Forma: CARTÃO NA MAQUININHA\n"
      : pagamento === "pix" || endereco.formaPagamento === "pix"
        ? "🟢 Forma: PIX — PAGO ONLINE\n"
        : `💳 Forma: CARTÃO ONLINE${tipoCartao ? ` — ${tipoCartao}` : ""}\n`;
  texto += pagamento === "dinheiro" || pagamento === "maquininha"
    ? "🟠 *Status: A RECEBER NA ENTREGA/RETIRADA*\n"
    : "✅ *Status: PAGAMENTO CONFIRMADO*\n";

  if (
    pagamento !== "maquininha" &&
    tipoCartao === "Crédito" &&
    Number(endereco.parcelas || 1) > 1
  ) {
    texto += `🔢 Parcelamento: ${endereco.parcelas}x\n`;
  } else if (tipoCartao && pagamento !== "maquininha") {
    texto += "🔢 Pagamento: 1x\n";
  }

  if (endereco.pagamento === "dinheiro") {
    texto += endereco.trocoPara
      ? `🚨 *LEVAR TROCO!*\n` +
        `💵 Cliente pagará com: R$ ${formatarValor(endereco.trocoPara)}\n` +
        `💰 Troco a devolver: R$ ${formatarValor(endereco.troco)}\n`
      : "✅ Cliente informou que NÃO precisa de troco\n";
  }

  if (modalidade !== "entrega") {
    const horario = endereco.horario === "assim_que_possivel"
      ? "O MAIS RÁPIDO POSSÍVEL"
      : endereco.horario || "Não informado";

    texto += `🕒 Horário: ${horario}\n`;
  }

  if (modalidade === "salao") {
    texto += `👥 Pessoas: ${endereco.quantidadePessoas || 1}\n`;
  }

  texto += "\n";

  texto += "━━━━━━━━━━━━━━━━━━━━\n";
  texto += "🍕 ITENS DO PEDIDO\n";
  texto += "━━━━━━━━━━━━━━━━━━━━\n\n";

  for (const pizza of pedido?.pizzas || []) {
    const quantidade = pizza.quantidade || pizza.qtd || 1;
    const sabores = Array.isArray(pizza.sabores) && pizza.sabores.length
      ? pizza.sabores.join(" / ")
      : pizza.sabor;

    texto += `🍕 ${quantidade}x ${sabores}\n`;
    texto += `📏 Tamanho: ${nomeTamanho(pizza.tamanho)}\n`;
    texto += "\n";
  }

  if (pedido?.observacaoPizzas) {
    texto += "⚠️━━━━━━━━━━━━━━━━━━━━⚠️\n";
    texto += "📝 *OBSERVAÇÃO INFORMADA PELO CLIENTE*\n\n";
    texto += `💬 *“${String(pedido.observacaoPizzas).trim()}”*\n`;
    texto += "⚠️━━━━━━━━━━━━━━━━━━━━⚠️\n\n";
  }

  for (const bebida of pedido?.bebidas || []) {
    const quantidade = bebida.quantidade || bebida.qtd || 1;
    texto += `🥤 ${quantidade}x ${bebida.nome}\n\n`;
  }

  const valorPedido = Number(endereco?.valorPedido ?? pedido?.total ?? 0);
  const taxaEntrega = Number(endereco?.taxaEntrega || 0);
  const totalFinal = Number(endereco?.totalFinal ?? valorPedido + taxaEntrega);

  texto += `💰 *VALOR TOTAL: R$ ${formatarValor(totalFinal)}*\n\n`;

  texto += "━━━━━━━━━━━━━━━━━━━━\n";
  texto += modalidade === "entrega"
    ? "📍 *ENDEREÇO DO CLIENTE*\n"
    : "📍 *DADOS DE RECEBIMENTO*\n";
  texto += "━━━━━━━━━━━━━━━━━━━━\n\n";

  texto += `📞 *Contato:* ${endereco.contato || "Não informado"}\n`;

  if (modalidade === "entrega") {
    texto += `🏠 *Endereço:* ${endereco.rua || "Não informado"}, nº ${endereco.numero || "Não informado"}\n`;
    texto += `📍 *Bairro:* ${endereco.bairro || "Não informado"}\n`;
    if (endereco.cep && endereco.cep !== "Não se aplica") {
      texto += `📮 *CEP:* ${endereco.cep}\n`;
    }
    texto += `➕ *Complemento:* ${endereco.complemento || "Sem complemento"}\n`;
    texto += `📌 *Referência:* ${endereco.referencia || "Sem referência"}\n\n`;
  }
  texto += `🕒 *Horário do pedido:* ${horarioPedido}`;

  return texto;
}

module.exports = {
  salvarEnderecoPedido,
  buscarEnderecoPedido,
  excluirEnderecoPedido,
  atualizarPagamentoPedido,
  formatarEnderecoAtendente,
  marcarPedidoConcluido
};

