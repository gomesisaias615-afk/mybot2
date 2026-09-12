const fs = require("fs");
const path = require("path");
const { diretorioDados } = require("./dadosPersistentes.service");
const { obterClienteWhatsApp } = require("./whatsappRuntime.service");
const { obterIdentidade } = require("./identidade.service");

const arquivoConvites = path.join(diretorioDados, "convites-grupo.json");
// Aguarda uma hora após o pedido antes de convidar o cliente para o grupo.
const TEMPO_CONVITE_MS = 60 * 60 * 1000;
let monitor = null;
let processando = false;

function ler() {
  try { return JSON.parse(fs.readFileSync(arquivoConvites, "utf8")); }
  catch { return []; }
}

function gravar(dados) {
  fs.mkdirSync(path.dirname(arquivoConvites), { recursive: true });
  const temporario = `${arquivoConvites}.${process.pid}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(dados, null, 2), "utf8");
  fs.renameSync(temporario, arquivoConvites);
}

function linkGrupo() {
  const texto = String(process.env.WHATSAPP_GROUP_URL || "").trim();
  const encontrado = texto.match(/https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/i);
  return encontrado ? encontrado[0] : texto;
}

function normalizarDestino(valor) {
  const original = String(valor || "");
  if (/@(?:c\.us|lid)$/i.test(original)) return original;
  let numero = original.replace(/\D/g, "");
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
  return numero ? `${numero}@c.us` : "";
}

function agendarConviteGrupo({ pedidoId, cliente, contato }) {
  if (!linkGrupo()) return false;
  const id = String(pedidoId || "").trim();
  const destino = normalizarDestino(contato || cliente);
  if (!id || !destino) return false;
  const convites = ler();
  if (convites.some(item => item.pedidoId === id)) return false;
  convites.push({
    pedidoId: id,
    destino,
    enviarEm: new Date(Date.now() + TEMPO_CONVITE_MS).toISOString(),
    status: "agendado"
  });
  gravar(convites);
  return true;
}

async function enviarConvite(item) {
  const nome = obterIdentidade().nome;
  const texto = `📢 *Acompanhe a ${nome}!*

Criamos nosso Grupo oficial para você receber promoções, novidades e ofertas especiais da pizzaria.

Quer entrar?`;
  const botoes = [
    { id: `grupo_entrar_${item.pedidoId}`, title: "Entrar no Grupo" },
    { id: `grupo_depois_${item.pedidoId}`, title: "Agora não" },
    { id: `grupo_entrei_${item.pedidoId}`, title: "Já entrei" }
  ];
  const cliente = obterClienteWhatsApp();
  if (typeof cliente.sendButtons === "function") return cliente.sendButtons(item.destino, texto, botoes);
  return cliente.sendMessage(item.destino, `${texto}\n\n1 - Entrar no Grupo\n2 - Agora não\n3 - Já entrei`);
}

async function processarConvites() {
  if (processando) return;
  processando = true;
  try {
    const convites = ler();
    let alterado = false;
    for (const item of convites) {
      if (item.status !== "agendado" || new Date(item.enviarEm).getTime() > Date.now()) continue;
      try {
        await enviarConvite(item);
        item.status = "enviado";
        item.enviadoEm = new Date().toISOString();
      } catch (erro) {
        item.tentativas = Number(item.tentativas || 0) + 1;
        item.ultimoErro = erro.message;
        item.enviarEm = new Date(Date.now() + Math.min(item.tentativas * 10, 60) * 60 * 1000).toISOString();
      }
      alterado = true;
    }
    if (alterado) gravar(convites);
  } finally { processando = false; }
}

function iniciarConvitesGrupo() {
  if (monitor) return;
  processarConvites().catch(erro => console.error("[GRUPO] Erro ao processar convites:", erro.message));
  monitor = setInterval(() => processarConvites().catch(erro => console.error("[GRUPO] Erro ao processar convites:", erro.message)), 30 * 1000);
  monitor.unref?.();
}

function textoNormalizado(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function processarRespostaConviteGrupo(msg) {
  const botao = String(msg?._data?.buttonId || "");
  const texto = textoNormalizado(msg?.body);
  const pedidoId = botao.match(/^grupo_(?:entrar|depois|entrei)_(.+)$/)?.[1];
  const destino = normalizarDestino(msg?.from);
  const convites = ler();
  const convite = pedidoId
    ? [...convites].reverse().find(item => item.pedidoId === pedidoId && item.status === "enviado")
    : [...convites].reverse().find(item => item.destino === destino && item.status === "enviado");
  if (!convite) return false;
  const entrar = botao.startsWith("grupo_entrar_") || texto === "1" || texto === "entrar no grupo";
  const depois = botao.startsWith("grupo_depois_") || texto === "2" || texto === "agora nao";
  const jaEntrei = botao.startsWith("grupo_entrei_") || texto === "3" || texto === "ja entrei";
  if (!entrar && !depois && !jaEntrei) return false;
  convite.status = entrar ? "link_enviado" : depois ? "depois" : "ja_entrou";
  convite.respondidoEm = new Date().toISOString();
  gravar(convites);
  if (entrar) {
    const link = linkGrupo();
    await msg.reply(link ? `📢 *Grupo oficial de promoções*\n\nToque em *Ver grupo* no cartão abaixo para entrar:\n${link}` : "O link do Grupo ainda não foi configurado.", undefined, { linkPreview: true });
  } else if (depois) {
    await msg.reply("Tudo bem 😊 Quando quiser, digite *promoções* para receber o link do Grupo.");
  } else {
    await msg.reply("Perfeito! 😊 Continue acompanhando as promoções no Grupo.");
  }
  return true;
}

module.exports = { agendarConviteGrupo, iniciarConvitesGrupo, processarRespostaConviteGrupo };

