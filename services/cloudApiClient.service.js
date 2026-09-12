const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

function somenteNumero(valor) {
  return String(valor || "").replace(/@(?:c\.us|s\.whatsapp\.net|lid)$/i, "").replace(/\D/g, "");
}

function textoDaMensagem(mensagem = {}) {
  return mensagem.text?.body
    || mensagem.button?.text
    || mensagem.interactive?.button_reply?.title
    || mensagem.interactive?.list_reply?.title
    || mensagem.image?.caption
    || mensagem.video?.caption
    || mensagem.document?.caption
    || "";
}

function tipoMime(arquivo) {
  const extensao = path.extname(arquivo).toLowerCase();
  return ({
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  })[extensao] || "application/octet-stream";
}

class CloudApiClient extends EventEmitter {
  constructor() {
    super();
    this.provider = "cloud_api";
    this.token = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    this.appSecret = process.env.META_APP_SECRET;
    this.graphVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    this.info = { wid: { user: String(process.env.WHATSAPP_BUSINESS_NUMBER || "") } };
    this.online = false;
  }

  async initialize() {
    const ausentes = [
      ["WHATSAPP_ACCESS_TOKEN", this.token],
      ["WHATSAPP_PHONE_NUMBER_ID", this.phoneNumberId],
      ["WHATSAPP_VERIFY_TOKEN", this.verifyToken]
    ].filter(([, valor]) => !valor).map(([nome]) => nome);

    if (ausentes.length) {
      throw new Error(`Variaveis da Cloud API ausentes: ${ausentes.join(", ")}`);
    }

    this.online = true;
    this.emit("authenticated");
    this.emit("ready");
  }

  verificarAssinatura(rawBody, assinatura) {
    if (!this.appSecret) return true;
    if (!assinatura?.startsWith("sha256=")) return false;
    const esperado = `sha256=${crypto.createHmac("sha256", this.appSecret).update(rawBody || "").digest("hex")}`;
    const recebido = String(assinatura);
    if (esperado.length !== recebido.length) return false;
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
  }

  processarWebhook(corpo = {}) {
    for (const entrada of corpo.entry || []) {
      for (const alteracao of entrada.changes || []) {
        const valor = alteracao.value || {};
        for (const mensagem of valor.messages || []) {
          const numero = somenteNumero(mensagem.from);
          const texto = textoDaMensagem(mensagem);
          const msg = {
            from: `${numero}@c.us`,
            to: `${somenteNumero(valor.metadata?.display_phone_number)}@c.us`,
            fromMe: false,
            body: texto,
            timestamp: Number(mensagem.timestamp || Math.floor(Date.now() / 1000)),
            id: { _serialized: mensagem.id },
            isStatus: false,
            broadcast: false,
            _data: { isNewMsg: true, buttonId: mensagem.interactive?.button_reply?.id || mensagem.button?.payload || null },
            reply: (conteudo, _chatId, opcoes) => this.sendMessage(numero, conteudo, opcoes),
            getContact: async () => ({ number: numero, id: { user: numero } })
          };
          this.emit("message", msg);
        }
      }
    }
  }

  async requisicaoGraph(caminho, opcoes = {}) {
    const resposta = await fetch(`https://graph.facebook.com/${this.graphVersion}/${caminho}`, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(opcoes.headers || {})
      }
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(`Cloud API ${resposta.status}: ${dados?.error?.message || JSON.stringify(dados)}`);
    }
    return dados;
  }

  async enviarPayload(payload) {
    return this.requisicaoGraph(`${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
    });
  }

  async enviarImagem(destino, conteudo, opcoes) {
    const arquivo = conteudo.__arquivo;
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", tipoMime(arquivo));
    form.append("file", new Blob([fs.readFileSync(arquivo)], { type: tipoMime(arquivo) }), path.basename(arquivo));
    const midia = await this.requisicaoGraph(`${this.phoneNumberId}/media`, { method: "POST", body: form });
    return this.enviarPayload({
      to: somenteNumero(destino),
      type: "image",
      image: { id: midia.id, caption: opcoes.caption || conteudo.caption || "" }
    });
  }

  async sendMessage(destino, conteudo, opcoes = {}) {
    if (!this.online) throw new Error("WhatsApp Cloud API ainda nao foi inicializada.");
    if (conteudo && conteudo.__arquivo) return this.enviarImagem(destino, conteudo, opcoes);
    return this.enviarPayload({
      to: somenteNumero(destino),
      type: "text",
      text: { body: String(conteudo ?? ""), preview_url: false }
    });
  }

  async sendButtons(destino, texto, botoes = []) {
    if (!this.online) throw new Error("WhatsApp Cloud API ainda nao foi inicializada.");
    return this.enviarPayload({
      to: somenteNumero(destino),
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

  async getContactById(id) {
    const numero = somenteNumero(id);
    return { number: numero, id: { user: numero } };
  }

  async destroy() {
    this.online = false;
    this.emit("disconnected", "APP_ENCERRADO");
  }
}

module.exports = { CloudApiClient };


