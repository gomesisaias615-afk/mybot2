const express = require("express");
const fs = require("fs");
const path = require("path");
const { processarWebhookPagamento } = require("./services/pagamento.webhook.service");
const { confirmarPedidoPagamentoLocal } = require("./services/monitoramento/pedidos.service");
const { buscarEnderecoPedido } = require("./services/enderecoPedido.service");
const { salvarCliente } = require("./services/marketing.service");
const { atendimento } = require("./flows/atendimento.coordenador");
const { protegerResposta } = require("./services/respostaSegura.service");
const { resetarUsuario, resetarTodosUsuarios, salvarContexto } = require("./flows/contextoAtendimento");
const { webhookUrlMercadoPago } = require("./config/pagamento");
let botDeveFuncionarHoje = () => true;
let obterHorarioConfigurado = () => ({ abertura: "00:00", fechamento: "00:00" });
let obterConfiguracaoPainel = () => ({ botAtivo: true, diasFuncionamento: {} });
const arquivoPainel = path.join(__dirname, "services", "painel.service.js");
if (fs.existsSync(arquivoPainel)) {
  ({ botDeveFuncionarHoje, obterHorarioConfigurado, obterConfiguracaoPainel } = require("./services/painel.service"));
}
const {
  clientMeta,
  extrairMensagens,
  validarAssinatura,
  validarConfiguracao,
  verificarWebhook
} = require("./services/whatsappMeta.service");
const { definirClienteWhatsApp } = require("./services/whatsappRuntime.service");
const { processarRespostaConviteGrupo } = require("./services/convitesCanal.service");
definirClienteWhatsApp(clientMeta);

process.on("unhandledRejection", erro => console.error("PROMESSA REJEITADA:", erro));
process.on("uncaughtException", erro => console.error("ERRO NAO TRATADO:", erro));

validarConfiguracao();
const app = express();
app.use(express.json({
  limit: "5mb",
  verify: (req, res, buffer) => { req.rawBody = buffer.toString("utf8"); }
}));

const mensagensProcessadas = new Map();
const filasAtendimento = new Map();
// Evita repetir o aviso de indisponibilidade para o mesmo cliente.
const clientesAvisadosIndisponibilidade = new Set();

async function processarMensagem(msg) {
  if (!msg?.body?.trim()) return;
  const id = msg.id?._serialized;
  if (id && mensagensProcessadas.has(id)) return;
  if (id) {
    mensagensProcessadas.set(id, Date.now());
    setTimeout(() => mensagensProcessadas.delete(id), 5 * 60 * 1000);
  }
  console.log(`[META] Mensagem recebida de ${msg.from}: ${msg.body}`);
  protegerResposta(msg);
  if (await processarRespostaConviteGrupo(msg)) return;
  if (!botDeveFuncionarHoje()) {
    resetarUsuario(msg.from);
    if (clientesAvisadosIndisponibilidade.has(msg.from)) {
      console.log(`[META] Aviso de indisponibilidade já enviado para ${msg.from}.`);
      return;
    }
    clientesAvisadosIndisponibilidade.add(msg.from);
    const horario = obterHorarioConfigurado();
    const configuracao = obterConfiguracaoPainel();
    const nomesDias = { domingo: "domingo", segunda: "segunda-feira", terca: "terça-feira", quarta: "quarta-feira", quinta: "quinta-feira", sexta: "sexta-feira", sabado: "sábado" };
    const dias = Object.entries(configuracao.diasFuncionamento || {}).filter(([, ativo]) => ativo).map(([dia]) => nomesDias[dia]).filter(Boolean);
    const diasTexto = dias.length === 7 ? "Todos os dias" : (dias.join(", ") || "Nenhum dia configurado");
    const horarioTexto = horario.abertura === horario.fechamento ? "24 horas nos dias de funcionamento" : `${horario.abertura} às ${horario.fechamento}`;
    await msg.reply(
      `🕐 *${configuracao.botAtivo ? "Estamos fechados no momento." : "Nosso atendimento está temporariamente pausado."}*\n\n` +
      `📅 *Dias de atendimento:* ${diasTexto}\n` +
      `⏰ *Horário:* ${horarioTexto}\n\n` +
      "Envie uma nova mensagem dentro do horário e teremos prazer em atender você. 🍕"
    );
    console.log(`[META] Mensagem de horário enviada para ${msg.from}.`);
    return;
  }
  // Ao voltar a funcionar, este cliente pode receber avisos futuros se a loja fechar novamente.
  clientesAvisadosIndisponibilidade.delete(msg.from);
  try { await atendimento(msg, clientMeta); } finally { salvarContexto(); }
}

function enfileirar(msg) {
  const usuario = msg.from;
  const anterior = filasAtendimento.get(usuario) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(() => processarMensagem(msg));
  filasAtendimento.set(usuario, atual);
  atual.catch(erro => console.error("[META] Erro ao atender:", erro)).finally(() => {
    if (filasAtendimento.get(usuario) === atual) filasAtendimento.delete(usuario);
  });
}

app.get("/webhook/whatsapp", verificarWebhook);
app.post("/webhook/whatsapp", (req, res) => {
  if (!validarAssinatura(req)) return res.sendStatus(401);
  const mensagens = extrairMensagens(req.body);
  res.sendStatus(200);
  mensagens.forEach(enfileirar);
});

app.post("/webhook/pagamento", async (req, res) => {
  try {
    console.log("[PAGAMENTO] Webhook recebido:", JSON.stringify(req.body));
    await processarWebhookPagamento(req.body, clientMeta);
    res.sendStatus(200);
  } catch (erro) {
    console.error("ERRO WEBHOOK PAGAMENTO:", erro);
    res.sendStatus(500);
  }
});

app.post("/webhook/cliente", (req, res) => {
  try {
    const endereco = buscarEnderecoPedido(req.body?.pedidoId);
    if (!endereco?.cliente || !endereco?.contato) {
      return res.status(400).json({ erro: "Cliente ou contato nao encontrado." });
    }
    salvarCliente(endereco.cliente, endereco.contato);
    return res.sendStatus(200);
  } catch (erro) {
    console.error("ERRO AO SALVAR CLIENTE:", erro);
    return res.sendStatus(500);
  }
});

app.post("/webhook/pedido-offline", async (req, res) => {
  try {
    const pedido = confirmarPedidoPagamentoLocal(req.body?.pedidoId);
    if (!pedido) return res.sendStatus(200);
    const endereco = buscarEnderecoPedido(pedido.id);
    if (!endereco) return res.status(400).json({ erro: "Dados de recebimento nao encontrados." });
    salvarCliente(pedido.cliente, endereco.contato);
    await clientMeta.sendMessage(pedido.cliente, `Pedido ${pedido.id} confirmado e enviado para a pizzaria.`);
    return res.sendStatus(200);
  } catch (erro) {
    console.error("ERRO PEDIDO OFFLINE:", erro);
    return res.sendStatus(500);
  }
});

const arquivoPainelRoutes = path.join(__dirname, "site", "admin.routes.js");
if (fs.existsSync(arquivoPainelRoutes)) app.use(require("./site/admin.routes"));
app.use(require("./site/server"));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", whatsapp: "meta", webhook: "/webhook/whatsapp" });
});

const porta = Number(process.env.PORT || 3000);
const servidor = app.listen(porta, "0.0.0.0", () => {
  console.log(`[META] Cloud API ativa na porta ${porta}`);
  console.log(`[META] Callback: ${(process.env.PUBLIC_URL || "").replace(/\/$/, "")}/webhook/whatsapp`);
  console.log(`[PAGAMENTO] Callback Mercado Pago: ${webhookUrlMercadoPago || "NAO CONFIGURADO"}`);
});

let funcionamentoAnterior = botDeveFuncionarHoje();
if (!funcionamentoAnterior) resetarTodosUsuarios();
const monitorFuncionamento = setInterval(() => {
  const funcionandoAgora = botDeveFuncionarHoje();
  if (funcionamentoAnterior && !funcionandoAgora) {
    const total = resetarTodosUsuarios();
    console.log(`[META] Horário encerrado. ${total} sessão(ões) de atendimento reiniciada(s).`);
  }
  if (!funcionamentoAnterior && funcionandoAgora) {
    clientesAvisadosIndisponibilidade.clear();
    console.log("[META] Atendimento reaberto; avisos de indisponibilidade liberados.");
  }
  funcionamentoAnterior = funcionandoAgora;
}, 30 * 1000);
monitorFuncionamento.unref?.();
let encerrando = false;
async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`${sinal} recebido; encerrando...`);
  clearInterval(monitorFuncionamento);
  servidor.close();
  
  process.exit(0);
}
process.once("SIGTERM", () => encerrar("SIGTERM"));
process.once("SIGINT", () => encerrar("SIGINT"));

module.exports = app;
