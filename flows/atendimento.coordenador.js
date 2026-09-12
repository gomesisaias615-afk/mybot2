const textos = require("./textosFlows");
const {
  contexto,
  resetarUsuario
} = require("./contextoAtendimento");
const {
  estoque,
  recarregarEstoque
} = require("../services/estoque.service");
const { normalizar } = require("../utils/texto");
const {
  mostrarMenu: mostrarMenuBase,
  tratarMenu,
  tratarAtalhoMenu
} = require("./handlers/menu.handler");
const { tratarPizza } = require("./handlers/pizza.handler");
const { tratarObservacaoPizza } = require("./handlers/observacaoPizza.handler");
const { tratarBebida } = require("./handlers/bebida.handler");
const { tratarResumo } = require("./handlers/resumo.handler");
const { tratarEndereco } = require("./handlers/endereco.handler");
const {
  finalizarPedido
} = require("./handlers/finalizacaoPedido.handler");

function mostrarMenu(msg, user) {
  return mostrarMenuBase(msg, user, contexto);
}

const ESTADOS_TEXTO_LIVRE = new Set([
  "pedido_pizza", "pedido_bebida", "digitar_observacao_pizza",
  "confirmar_pizza", "perguntar_observacao_pizza", "confirmar_bebida",
  "confirmar_resumo", "conf_contato", "conf_rua", "conf_numero", "conf_bairro",
  "complemento_pergunta", "referencia_pergunta", "confirmar_endereco",
  "endereco_contato", "endereco_rua", "endereco_numero", "endereco_bairro",
  "endereco_complemento", "endereco_referencia", "pagamento_tipo"
]);

async function tratarComandoGlobal(msg, client, user, texto) {
  const iniciarAtendimento =
    ["menu", "oi", "oi bot", "ola", "ola bot", "pizza", "bom dia", "boa tarde", "boa noite"]
      .includes(texto) ||
    texto === "quero pizza" ||
    texto === "quero uma pizza";

  if (iniciarAtendimento) {
    resetarUsuario(user);
    await mostrarMenu(msg, user);
    return true;
  }

  return false;
}

async function atendimento(msg, client) {
  const user = msg.from;
  const texto = normalizar(msg.body);
  const estadoAtual = contexto.estados[user];

  // "menu" sempre vence qualquer outro fluxo, inclusive pedido, endereço e pagamento.
  if (texto === "menu") {
    resetarUsuario(user);
    await mostrarMenu(msg, user);
    return;
  }

  if (estadoAtual === "aguardando_atendente") {
    await msg.reply("👩‍💼 Aguarde a resposta da atendente ou envie *menu* para voltar ao atendimento automático.");
    return;
  }

  const aguardandoTextoLivre = ESTADOS_TEXTO_LIVRE.has(estadoAtual);
  const respostaPorBotao = Boolean(msg._data?.isButtonResponse);

  const parametros = {
    msg,
    client,
    user,
    contexto,
    estoque,
    recarregarEstoque,
    resetarUsuario,
    mostrarMenu
  };

  // Textos/IDs dos quatro botões do menu têm prioridade sobre o cardápio.
  // Isso impede que "Instagram" ou "Promoções" seja tratado como produto.
  if (await tratarAtalhoMenu(parametros)) return;

  if (!aguardandoTextoLivre && await tratarComandoGlobal(msg, client, user, texto)) {
    return;
  }

  if (!aguardandoTextoLivre && !respostaPorBotao) {
    resetarUsuario(user);
    await mostrarMenu(msg, user);
    return;
  }

  if (!contexto.estados[user]) {
    await mostrarMenu(msg, user);
    return;
  }

  if (await tratarMenu(parametros)) return;
  if (await tratarPizza(parametros)) return;
  if (await tratarObservacaoPizza(parametros)) return;
  if (await tratarBebida(parametros)) return;
  if (await tratarResumo(parametros)) return;
  if (await tratarEndereco(parametros)) return;

  recarregarEstoque();

  if (await finalizarPedido(parametros)) return;

  console.warn(
    `Estado desconhecido para ${user}:`,
    contexto.estados[user]
  );

  resetarUsuario(user);
  await msg.reply(textos.menuErro);
  await mostrarMenu(msg, user);
}

module.exports = {
  atendimento,
  mostrarMenu
};


