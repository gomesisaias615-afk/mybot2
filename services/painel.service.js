const fs = require("fs");
const path = require("path");

const { garantirArquivo } = require("./dadosPersistentes.service");
const configuracaoPath = garantirArquivo("painel.json", "data/painel.json", {});

// Para preparar o bot para outra empresa, altere somente este bloco.
const LOCALIDADE_EMPRESA = Object.freeze({
  estado: "SE",
  municipio: "Estância",
  // Centro inicial da cidade; o endereço exato é escolhido no painel.
  latitudeMapaInicial: -11.2659,
  longitudeMapaInicial: -37.4484,
  zoomMapaInicial: 15
});

const PADRAO = {
  botAtivo: true,
  horarioAbertura: "00:00",
  horarioFechamento: "00:00",
  diasFuncionamento: {
    domingo: true, segunda: true, terca: true, quarta: true,
    quinta: true, sexta: true, sabado: true
  },
  entrega: {
    modoTaxa: "por_km",
    taxaFixa: 0,
    valorPorKm: 0,
    taxaMinima: 0,
    distanciaMaximaKm: 0,
    enderecoPizzaria: "",
    // A localização deve ser definida no painel antes do uso em produção.
    latitudePizzaria: LOCALIDADE_EMPRESA.latitudeMapaInicial,
    longitudePizzaria: LOCALIDADE_EMPRESA.longitudeMapaInicial,
    estadoAtendido: LOCALIDADE_EMPRESA.estado,
    cidadeAtendida: LOCALIDADE_EMPRESA.municipio,
    latitudeMapaInicial: LOCALIDADE_EMPRESA.latitudeMapaInicial,
    longitudeMapaInicial: LOCALIDADE_EMPRESA.longitudeMapaInicial,
    zoomMapaInicial: LOCALIDADE_EMPRESA.zoomMapaInicial
  },
  atualizadoEm: null
};

function lerJson(caminho, padrao) {
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    return padrao;
  }
}

function obterConfiguracaoPainel() {
  const salva = lerJson(configuracaoPath, {});
  return {
    botAtivo: salva.botAtivo !== false,
    horarioAbertura: minutosDoHorario(salva.horarioAbertura) !== null ? salva.horarioAbertura : PADRAO.horarioAbertura,
    horarioFechamento: minutosDoHorario(salva.horarioFechamento) !== null ? salva.horarioFechamento : PADRAO.horarioFechamento,
    diasFuncionamento: { ...PADRAO.diasFuncionamento, ...(salva.diasFuncionamento || {}) },
    entrega: normalizarConfiguracaoEntrega(salva.entrega),
    atualizadoEm: salva.atualizadoEm || null
  };
}

function numeroEntrega(valor, padrao, minimo = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= minimo ? numero : padrao;
}

function coordenadaEntrega(valor, padrao, minimo, maximo) {
  if (valor === null || valor === undefined || valor === "") return padrao;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= minimo && numero <= maximo ? numero : padrao;
}

function normalizarConfiguracaoEntrega(valor = {}) {
  const base = PADRAO.entrega;
  const modoTaxa = valor.modoTaxa === "fixa" ? "fixa" : "por_km";
  return {
    modoTaxa,
    taxaFixa: numeroEntrega(valor.taxaFixa, base.taxaFixa),
    valorPorKm: numeroEntrega(valor.valorPorKm, base.valorPorKm),
    taxaMinima: numeroEntrega(valor.taxaMinima, base.taxaMinima),
    distanciaMaximaKm: numeroEntrega(valor.distanciaMaximaKm, base.distanciaMaximaKm, 0.5),
    enderecoPizzaria: String(valor.enderecoPizzaria || base.enderecoPizzaria).trim(),
    latitudePizzaria: coordenadaEntrega(valor.latitudePizzaria, base.latitudePizzaria, -90, 90),
    longitudePizzaria: coordenadaEntrega(valor.longitudePizzaria, base.longitudePizzaria, -180, 180),
    // Estado e município são definidos na implantação, não pelo atendente.
    estadoAtendido: base.estadoAtendido,
    cidadeAtendida: base.cidadeAtendida,
    latitudeMapaInicial: coordenadaEntrega(valor.latitudeMapaInicial, base.latitudeMapaInicial, -90, 90),
    longitudeMapaInicial: coordenadaEntrega(valor.longitudeMapaInicial, base.longitudeMapaInicial, -180, 180),
    // Evita que um zoom antigo salvo no painel substitua o padrão da cidade.
    zoomMapaInicial: base.zoomMapaInicial
  };
}

function atualizarConfiguracaoPainel(alteracoes) {
  const atual = obterConfiguracaoPainel();
  if (typeof alteracoes?.botAtivo === "boolean") atual.botAtivo = alteracoes.botAtivo;
  if (minutosDoHorario(alteracoes?.horarioAbertura) !== null) atual.horarioAbertura = alteracoes.horarioAbertura;
  if (minutosDoHorario(alteracoes?.horarioFechamento) !== null) atual.horarioFechamento = alteracoes.horarioFechamento;
  if (alteracoes?.diasFuncionamento && typeof alteracoes.diasFuncionamento === "object") {
    for (const dia of Object.keys(PADRAO.diasFuncionamento)) {
      if (typeof alteracoes.diasFuncionamento[dia] === "boolean") {
        atual.diasFuncionamento[dia] = alteracoes.diasFuncionamento[dia];
      }
    }
  }
  if (alteracoes?.entrega && typeof alteracoes.entrega === "object") {
    atual.entrega = normalizarConfiguracaoEntrega({ ...atual.entrega, ...alteracoes.entrega });
  }

  atual.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(configuracaoPath, JSON.stringify(atual, null, 2), "utf8");
  return atual;
}

function obterDiaAtual() {
  const curto = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: process.env.BOT_TIMEZONE || "America/Fortaleza"
  }).format(new Date()).toLowerCase();
  return ({ sun: "domingo", mon: "segunda", tue: "terca", wed: "quarta", thu: "quinta", fri: "sexta", sat: "sabado" })[curto];
}

function minutosDoHorario(valor) {
  const resultado = /^(\d{2}):(\d{2})$/.exec(String(valor || "").trim());
  if (!resultado) return null;
  const hora = Number(resultado[1]);
  const minuto = Number(resultado[2]);
  if (hora > 23 || minuto > 59) return null;
  return hora * 60 + minuto;
}

function minutosAgora() {
  const partes = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    timeZone: process.env.BOT_TIMEZONE || "America/Fortaleza"
  }).formatToParts(new Date());
  const obter = tipo => Number(partes.find(item => item.type === tipo)?.value || 0);
  return obter("hour") * 60 + obter("minute");
}

function botDentroDoHorario(configuracao = obterConfiguracaoPainel()) {
  const abertura = minutosDoHorario(configuracao.horarioAbertura);
  const fechamento = minutosDoHorario(configuracao.horarioFechamento);
  if (abertura === null || fechamento === null || abertura === fechamento) return true;
  const agora = minutosAgora();
  return abertura < fechamento ? agora >= abertura && agora < fechamento : agora >= abertura || agora < fechamento;
}

function obterHorarioConfigurado() {
  const configuracao = obterConfiguracaoPainel();
  return {
    abertura: configuracao.horarioAbertura,
    fechamento: configuracao.horarioFechamento,
    fuso: process.env.BOT_TIMEZONE || "America/Fortaleza",
    dentroDoHorario: botDentroDoHorario(configuracao)
  };
}
function botDeveFuncionarHoje() {
  const configuracao = obterConfiguracaoPainel();
  return Boolean(configuracao.botAtivo && configuracao.diasFuncionamento[obterDiaAtual()] && botDentroDoHorario());
}

function obterDadosPainel() {
  const pedidosPath = garantirArquivo("pedidos.json", "services/monitoramento/relatorio/pedidos.json", []);
  const enderecosPath = garantirArquivo("enderecosPedidos.json", "services/monitoramento/relatorio/enderecosPedidos.json", {});
  let pedidos = lerJson(pedidosPath, []);
  const enderecos = lerJson(enderecosPath, {});
  // Mantém pedidos concluídos ou recusados no Histórico por 24 horas.
  const retencaoMs = Math.max(1, Number(process.env.HISTORICO_RETENCAO_MINUTOS || 1440)) * 60 * 1000;
  const agora = Date.now();
  const expirados = pedidos.filter(pedido =>
    ["saiu_entrega", "concluido", "cancelado"].includes(pedido.status) &&
    agora - new Date(pedido.atualizadoEm || pedido.criadoEm || 0).getTime() >= retencaoMs
  );
  if (expirados.length) {
    const idsExpirados = new Set(expirados.map(pedido => String(pedido.id)));
    pedidos = pedidos.filter(pedido => !idsExpirados.has(String(pedido.id)));
    for (const id of idsExpirados) delete enderecos[id];
    fs.writeFileSync(pedidosPath, JSON.stringify(pedidos, null, 2), "utf8");
    fs.writeFileSync(enderecosPath, JSON.stringify(enderecos, null, 2), "utf8");
  }
  const estoque = lerJson(garantirArquivo("estoque.json", "services/monitoramento/estoque.json", { pizzas: {}, bebidas: {}, acompanhamentos: {}, combos: {} }), { pizzas: {}, bebidas: {}, acompanhamentos: {}, combos: {} });
  estoque.acompanhamentos = estoque.acompanhamentos || {};
  estoque.combos = estoque.combos || {};

  return {
    configuracao: obterConfiguracaoPainel(),
    diaAtual: obterDiaAtual(),
    horario: obterHorarioConfigurado(),
    botFuncionando: botDeveFuncionarHoje(),
    pedidos: pedidos
      .map(pedido => ({ ...pedido, recebimento: enderecos[pedido.id] || pedido.recebimento || null }))
      .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)),
    estoque,
    atualizadoEm: new Date().toISOString()
  };
}

module.exports = {
  obterConfiguracaoPainel,
  atualizarConfiguracaoPainel,
  obterDadosPainel,
  botDeveFuncionarHoje,
  obterDiaAtual,
  botDentroDoHorario,
  obterHorarioConfigurado
};
