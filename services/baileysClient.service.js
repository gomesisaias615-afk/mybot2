const { EventEmitter } = require("events");
const fs = require("fs");
const mongoose = require("mongoose");
const pino = require("pino");

function paraJid(id) {
  const valor = String(id || "");
  if (!valor) return valor;
  if (valor.endsWith("@c.us")) return `${valor.slice(0, -5)}@s.whatsapp.net`;
  if (valor.includes("@")) return valor;
  return `${valor.replace(/\D/g, "")}@s.whatsapp.net`;
}

function paraIdLegado(jid) {
  return String(jid || "").replace(/@s\.whatsapp\.net$/, "@c.us");
}

function extrairTexto(conteudo = {}) {
  const mensagem = conteudo.ephemeralMessage?.message
    || conteudo.viewOnceMessage?.message
    || conteudo.viewOnceMessageV2?.message
    || conteudo;
  return mensagem.conversation
    || mensagem.extendedTextMessage?.text
    || mensagem.imageMessage?.caption
    || mensagem.videoMessage?.caption
    || "";
}

async function criarEstadoMongo(Baileys, clientId) {
  const { BufferJSON, initAuthCreds, proto } = Baileys;
  const schema = new mongoose.Schema({
    clientId: { type: String, required: true },
    chave: { type: String, required: true },
    valor: { type: String, required: true },
    atualizadoEm: { type: Date, default: Date.now }
  }, { versionKey: false });
  schema.index({ clientId: 1, chave: 1 }, { unique: true });
  const Modelo = mongoose.models.BaileysAuth
    || mongoose.model("BaileysAuth", schema, "baileys_auth");

  const ler = async chave => {
    const doc = await Modelo.findOne({ clientId, chave }).lean();
    return doc ? JSON.parse(doc.valor, BufferJSON.reviver) : null;
  };
  const salvar = async (chave, valor) => {
    if (valor == null) {
      await Modelo.deleteOne({ clientId, chave });
      return;
    }
    await Modelo.updateOne(
      { clientId, chave },
      { $set: { valor: JSON.stringify(valor, BufferJSON.replacer), atualizadoEm: new Date() } },
      { upsert: true }
    );
  };

  const creds = await ler("creds") || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const resultado = {};
          await Promise.all(ids.map(async id => {
            let valor = await ler(`${tipo}:${id}`);
            if (tipo === "app-state-sync-key" && valor) {
              valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
            }
            if (valor) resultado[id] = valor;
          }));
          return resultado;
        },
        set: async dados => {
          const tarefas = [];
          for (const tipo of Object.keys(dados)) {
            for (const id of Object.keys(dados[tipo] || {})) {
              tarefas.push(salvar(`${tipo}:${id}`, dados[tipo][id]));
            }
          }
          await Promise.all(tarefas);
        }
      }
    },
    saveCreds: () => salvar("creds", creds),
    clearAuth: () => Modelo.deleteMany({ clientId })
  };
}

class BaileysClient extends EventEmitter {
  constructor({ clientId = "pizzaria2" } = {}) {
    super();
    this.clientId = clientId;
    this.socket = null;
    this.info = null;
    this.encerrado = false;
    this.reconectando = false;
    this.Baileys = null;
    this.clearAuth = null;
  }

  async initialize() {
    this.Baileys = await import("@whiskeysockets/baileys");
    await this.conectar();
  }

  async conectar() {
    if (this.encerrado) return;
    this.reconectando = false;
    const B = this.Baileys;
    const { state, saveCreds, clearAuth } = await criarEstadoMongo(B, this.clientId);
    this.clearAuth = clearAuth;
    const { version } = await B.fetchLatestBaileysVersion();
    console.log(`[BAILEYS] CONECTANDO | versao=${version.join(".")}`);

    const socket = B.default({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["BOT1 Pizzaria", "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false
    });
    this.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", update => this.tratarConexao(update));
    socket.ev.on("messages.upsert", evento => this.tratarMensagens(evento));
  }

  async tratarConexao({ connection, lastDisconnect, qr }) {
    if (qr) this.emit("qr", qr);
    if (connection === "open") {
      this.info = { wid: { user: String(this.socket.user?.id || "").split(":")[0] } };
      this.emit("authenticated");
      this.emit("ready");
    }
    if (connection !== "close" || this.encerrado) return;
    const codigo = lastDisconnect?.error?.output?.statusCode
      ?? lastDisconnect?.error?.data?.statusCode
      ?? lastDisconnect?.error?.statusCode;
    const motivo = codigo === this.Baileys.DisconnectReason.loggedOut ? "LOGOUT" : String(codigo || "CONNECTION_CLOSED");
    this.emit("disconnected", motivo);
    if (motivo === "LOGOUT") {
      console.warn("[BAILEYS] Sessao invalida; limpando autenticacao e gerando novo QR.");
      await this.clearAuth?.();
    }
    if (!this.reconectando) {
      this.reconectando = true;
      setTimeout(() => this.conectar().catch(erro => this.emit("auth_failure", erro.message)), 3000).unref();
    }
  }

  async tratarMensagens({ messages, type }) {
    if (type !== "notify") return;
    for (const original of messages) {
      if (!original.message || !original.key?.remoteJid) continue;
      const jid = original.key.remoteJid;
      const msg = {
        from: paraIdLegado(jid),
        to: paraIdLegado(this.socket.user?.id),
        fromMe: Boolean(original.key.fromMe),
        body: extrairTexto(original.message),
        timestamp: Number(original.messageTimestamp || Math.floor(Date.now() / 1000)),
        id: { _serialized: original.key.id },
        isStatus: jid === "status@broadcast",
        broadcast: jid.endsWith("@broadcast"),
        _data: { isNewMsg: true },
        reply: (conteudo, _chatId, opcoes) => this.sendMessage(jid, conteudo, opcoes),
        getContact: async () => ({ number: String(jid).split("@")[0], id: { user: String(jid).split("@")[0] } })
      };
      this.emit("message", msg);
    }
  }

  async sendMessage(destino, conteudo, opcoes = {}) {
    if (!this.socket) throw new Error("WhatsApp ainda nao foi inicializado.");
    const jid = paraJid(destino);
    if (conteudo && conteudo.__arquivo) {
      return this.socket.sendMessage(jid, {
        image: fs.readFileSync(conteudo.__arquivo),
        caption: opcoes.caption || conteudo.caption || ""
      });
    }
    return this.socket.sendMessage(jid, { text: String(conteudo ?? "") });
  }

  async getContactById(id) {
    const numero = paraJid(id).split("@")[0];
    return { number: numero, id: { user: numero } };
  }

  async destroy() {
    this.encerrado = true;
    this.socket?.end?.(new Error("Aplicacao encerrada"));
  }
}

module.exports = { BaileysClient };

