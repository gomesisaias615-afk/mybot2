const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const ARQUIVOS = [
  "data/clientes.json", "data/configuracaoCardapio.json", "data/nomesbebidas.json",
  "data/pizzas.json", "data/precosbebidas.json",
  "data/painel.json",
  "services/monitoramento/estoque.json",
  "services/monitoramento/relatorio/pedidos.json",
  "services/monitoramento/relatorio/enderecosPedidos.json"
];
let ArquivoPersistente;
let sincronizador = null;
let sincronizando = false;

function obterModelo() {
  if (ArquivoPersistente) return ArquivoPersistente;
  const schema = new mongoose.Schema({
    chave: { type: String, required: true, unique: true },
    conteudo: { type: mongoose.Schema.Types.Mixed, required: true },
    atualizadoEm: { type: Date, default: Date.now }
  }, { versionKey: false });
  ArquivoPersistente = mongoose.models.ArquivoPersistente
    || mongoose.model("ArquivoPersistente", schema, "arquivos_persistentes");
  return ArquivoPersistente;
}
function caminhoAbsoluto(relativo) { return path.join(__dirname, "..", ...relativo.split("/")); }
function lerJson(relativo) {
  try { return JSON.parse(fs.readFileSync(caminhoAbsoluto(relativo), "utf8")); }
  catch (erro) {
    if (erro.code !== "ENOENT") console.error(`JSON invalido em ${relativo}:`, erro.message);
    return null;
  }
}
function gravarJson(relativo, conteudo) {
  const destino = caminhoAbsoluto(relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(conteudo, null, 2), "utf8");
}
async function enviarArquivo(relativo) {
  if (mongoose.connection.readyState !== 1) return;
  const conteudo = lerJson(relativo);
  if (conteudo === null) return;
  await obterModelo().updateOne({ chave: relativo },
    { $set: { conteudo, atualizadoEm: new Date() } }, { upsert: true });
}
async function restaurarOuSemear() {
  for (const relativo of ARQUIVOS) {
    const remoto = await obterModelo().findOne({ chave: relativo }).lean();
    if (remoto) gravarJson(relativo, remoto.conteudo);
    else await enviarArquivo(relativo);
  }
}
async function sincronizarArquivos() {
  if (sincronizando || mongoose.connection.readyState !== 1) return;
  sincronizando = true;
  try {
    await Promise.all(ARQUIVOS.map(enviarArquivo));
  } finally {
    sincronizando = false;
  }
}
function observarAlteracoes() {
  sincronizador = setInterval(() => {
    sincronizarArquivos().catch(erro =>
      console.error("Erro ao sincronizar arquivos com MongoDB:", erro.message)
    );
  }, 15000);
  sincronizador.unref();
}

async function iniciarPersistenciaMongo() {
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI ausente; usando somente os arquivos locais.");
    return false;
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || "mybot_pizzaria", serverSelectionTimeoutMS: 15000
  });
  await restaurarOuSemear();
  observarAlteracoes();
  console.log(`MongoDB conectado: ${mongoose.connection.name}`);
  return true;
}
async function encerrarPersistenciaMongo() {
  if (sincronizador) clearInterval(sincronizador);
  sincronizador = null;
  if (mongoose.connection.readyState === 1) {
    await Promise.allSettled(ARQUIVOS.map(enviarArquivo));
    await mongoose.disconnect();
  }
}
module.exports = { iniciarPersistenciaMongo, encerrarPersistenciaMongo };

