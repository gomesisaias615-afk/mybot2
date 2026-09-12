const textos = require("../textosFlows");
const { normalizar } = require("../../utils/texto");
const { salvarContexto } = require("../contextoAtendimento");
const temInstagram = /^https?:\/\//i.test(String(process.env.INSTAGRAM_URL || "").trim());
const temGrupoPromocoes = /^https?:\/\//i.test(String(process.env.WHATSAPP_GROUP_URL || "").trim());

async function mostrarMenu(msg, user, contexto) {
  contexto.estados[user] = "menu";
  await (typeof msg.replyMenu === "function"
    ? msg.replyMenu(textos.menuInicial)
    : msg.reply(textos.menuInicial));
}

function identificarOpcaoMenu(msg, permitirNumeros = false) {
  // Na Cloud API o id do botão é mais confiável do que o título exibido.
  // No WhatsApp Web/Baileys recebemos o próprio texto do botão.
  const idBotao = String(msg._data?.buttonId || "")
    .replace(/^menu_/, "")
    .replace(/_/g, " ");
  const texto = normalizar(idBotao || msg.body)
    .replace(/^[^a-z0-9]+/i, "");

  if (["fazer pedido", "pedido", "fazer pedido pizza"].includes(texto)) return "pedido";
  if (["instagram", "instagram da pizzaria"].includes(texto)) return "instagram";
  if (["ofertas", "oferta", "promocoes", "promocao", "grupo de promocoes"].includes(texto)) return "promocoes";
  if (["mybot", "contato mybot", "entrar em contato com a mybot"].includes(texto)) return "contato";

  if (permitirNumeros) {
    return ({ "1": "pedido", "2": "instagram", "3": "promocoes", "4": "contato" })[texto] || null;
  }
  return null;
}

async function executarOpcaoMenu({
  msg,
  user,
  contexto,
  estoque,
  recarregarEstoque
}, permitirNumeros = false) {
  const opcao = identificarOpcaoMenu(msg, permitirNumeros);
  if (!opcao) return false;

  if (opcao === "pedido") {
    recarregarEstoque();
    contexto.estados[user] = "pedido_pizza";
    await msg.reply(textos.comoPedirPizza);
    await msg.reply(textos.linkCardapioDigital, undefined, { linkPreview: false });
    return true;
  }

  if (opcao === "instagram") {
    if (!temInstagram) {
      await msg.reply("📸 O Instagram da hamburgueria ainda não foi configurado.");
      return true;
    }
    await msg.reply(textos.instagram, undefined, { linkPreview: true });
    return true;
  }

  if (opcao === "promocoes") {
    if (!temGrupoPromocoes) {
      await msg.reply("📢 O grupo de promoções ainda não foi configurado.");
      return true;
    }
    await msg.reply(textos.grupoPromocoes, undefined, { linkPreview: true });
    return true;
  }

  if (opcao === "contato") {
    await msg.reply(textos.contatoMyBot, undefined, { linkPreview: true });
    return true;
  }

  return false;
}

async function tratarMenu(parametros) {
  if (parametros.contexto.estados[parametros.user] !== "menu") return false;

  const tratado = await executarOpcaoMenu(parametros, true);
  if (tratado) return true;

  await parametros.msg.reply(textos.menuErro);
  await mostrarMenu(parametros.msg, parametros.user, parametros.contexto);
  return true;
}

// Atalhos do menu são globais, mas os números continuam exclusivos do menu.
// Assim "1 pizza" não é confundido com a opção "Fazer pedido" durante um pedido.
async function tratarAtalhoMenu(parametros) {
  return executarOpcaoMenu(parametros, false);
}

module.exports = {
  mostrarMenu,
  tratarMenu,
  tratarAtalhoMenu
};

