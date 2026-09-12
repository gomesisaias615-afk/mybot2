const crypto = require("crypto");

const API_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

function somenteDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function validarConfiguracao() {
  const ausentes = [];
  if (!ACCESS_TOKEN) ausentes.push("WHATSAPP_ACCESS_TOKEN");
  if (!PHONE_NUMBER_ID) ausentes.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!VERIFY_TOKEN) ausentes.push("WHATSAPP_VERIFY_TOKEN");
  if (ausentes.length) throw new Error(`Variaveis da Meta ausentes: ${ausentes.join(", ")}`);
}

async function requisitarMeta(payload) {
  validarConfiguracao();
  const resposta = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`Meta Graph API ${resposta.status}: ${dados?.error?.message || JSON.stringify(dados)}`);
  return dados;
}

async function enviarTexto(destinatario, texto) {
  return requisitarMeta({
    to: somenteDigitos(destinatario),
    type: "text",
    text: { preview_url: true, body: String(texto) }
  });
}

async function enviarBotoes(destinatario, texto, botoes = []) {
  return requisitarMeta({
    to: somenteDigitos(destinatario),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: String(texto).slice(0, 1024) },
      action: { buttons: botoes.slice(0, 3).map(botao => ({
        type: "reply",
        reply: { id: String(botao.id).slice(0, 256), title: String(botao.title).slice(0, 20) }
      })) }
    }
  });
}

async function enviarMenu(destinatario, texto) {
  const opcoes = [
    { id: "menu_fazer_pedido", title: "🍕 Fazer pedido", description: "Veja o cardápio e monte seu pedido" },
    /^https?:\/\//i.test(String(process.env.INSTAGRAM_URL || "").trim()) ? { id: "menu_instagram", title: "📸 Instagram", description: "Acompanhe a pizzaria" } : null,
    /^https?:\/\//i.test(String(process.env.WHATSAPP_GROUP_URL || "").trim()) ? { id: "menu_promocoes", title: "📢 Ofertas", description: "Promoções e novidades" } : null,
    { id: "menu_contato_mybot", title: "✉️ Contato MyBot", description: "Fale com a equipe do sistema" }
  ].filter(Boolean);
  return requisitarMeta({
    to: somenteDigitos(destinatario),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: String(texto).slice(0, 1024) },
      footer: { text: "Toque no botão abaixo para continuar" },
      action: {
        button: "Ver opções",
        sections: [{
          title: "Menu principal",
          rows: opcoes
        }]
      }
    }
  });
}

function normalizarParaDeteccao(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function removerLinhasNumeradas(texto) {
  return String(texto || "").split(/\r?\n/)
    .filter(linha => !/^\s*[12]\ufe0f?\u20e3/.test(linha))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function enviarEscolha(destinatario, texto, tipo) {
  const pixCartao = tipo === "pagamento";
  let corpo = removerLinhasNumeradas(texto);
  if (normalizarParaDeteccao(corpo).includes("1 para sim ou 2 para nao")) {
    corpo = "Escolha uma opcao abaixo:";
  }
  if (corpo.length > 1024) {
    await enviarTexto(destinatario, corpo);
    corpo = "Escolha uma opcao abaixo:";
  }
  return requisitarMeta({
    to: somenteDigitos(destinatario),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: corpo || "Escolha uma opcao abaixo:" },
      action: { buttons: pixCartao
        ? [
            { type: "reply", reply: { id: "opcao_pix", title: "PIX" } },
            { type: "reply", reply: { id: "opcao_cartao", title: "Cartao" } }
          ]
        : [
            { type: "reply", reply: { id: "opcao_sim", title: "Sim" } },
            { type: "reply", reply: { id: "opcao_nao", title: "Nao" } }
          ]
      }
    }
  });
}

async function enviarResposta(destinatario, texto) {
  const original = String(texto || "");
  const normalizado = normalizarParaDeteccao(original);
  const possuiUmEDois = original.includes("1️⃣") && original.includes("2️⃣");
  if (possuiUmEDois && normalizado.includes("pix") && normalizado.includes("cartao")) {
    return enviarEscolha(destinatario, original, "pagamento");
  }
  if ((possuiUmEDois && normalizado.includes("sim") && normalizado.includes("nao")) ||
      normalizado.includes("1 para sim ou 2 para nao")) {
    return enviarEscolha(destinatario, original, "sim_nao");
  }
  return enviarTexto(destinatario, original);
}

const clientMeta = {
  info: { wid: { user: somenteDigitos(process.env.WHATSAPP_BUSINESS_NUMBER) } },
  sendMessage: enviarTexto,
  sendButtons: enviarBotoes,
  destroy: async () => {}
};

function validarAssinatura(req) {
  if (!APP_SECRET) return true;
  const assinatura = req.get("x-hub-signature-256");
  if (!assinatura || !req.rawBody) return false;
  const esperada = `sha256=${crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex")}`;
  const recebido = Buffer.from(assinatura);
  const calculado = Buffer.from(esperada);
  return recebido.length === calculado.length && crypto.timingSafeEqual(recebido, calculado);
}

function verificarWebhook(req, res) {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    console.log("[META] Webhook verificado com sucesso.");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
}

function textoDaMensagem(mensagem) {
  if (mensagem.type === "text") return mensagem.text?.body || "";
  if (mensagem.type === "button") return mensagem.button?.text || mensagem.button?.payload || "";
  if (mensagem.type === "interactive") {
    const resposta = mensagem.interactive?.button_reply || mensagem.interactive?.list_reply;
    const mapa = { menu_fazer_pedido: "fazer pedido", menu_instagram: "instagram", menu_promocoes: "promocoes", menu_contato_mybot: "contato mybot", opcao_sim: "1", opcao_nao: "2", opcao_pix: "1", opcao_cartao: "2" };
    return mapa[resposta?.id] || resposta?.title || "";
  }
  return "";
}

function criarMensagemCompativel(mensagem) {
  const telefone = somenteDigitos(mensagem.from);
  return {
    from: `${telefone}@c.us`, fromMe: false, isStatus: false, broadcast: false,
    timestamp: Number(mensagem.timestamp), body: textoDaMensagem(mensagem),
    id: { _serialized: mensagem.id }, _data: { isNewMsg: true, isButtonResponse: ["button", "interactive"].includes(mensagem.type), buttonId: mensagem.interactive?.button_reply?.id || mensagem.button?.payload || null },
    reply: texto => enviarResposta(telefone, texto),
    replyMenu: texto => enviarMenu(telefone, texto)
  };
}

function extrairMensagens(body) {
  const mensagens = [];
  for (const entrada of body?.entry || []) {
    for (const alteracao of entrada?.changes || []) {
      for (const mensagem of alteracao?.value?.messages || []) mensagens.push(criarMensagemCompativel(mensagem));
    }
  }
  return mensagens;
}

module.exports = { clientMeta, extrairMensagens, validarAssinatura, validarConfiguracao, verificarWebhook };
