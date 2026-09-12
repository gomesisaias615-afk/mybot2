const express = require("express");

process.on("unhandledRejection", err => {
  console.error("PROMISE REJEITADA:", err);
});

process.on("uncaughtException", err => {
  console.error("ERRO NÃO TRATADO:", err);
});

const { BaileysClient } = require("./services/baileysClient.service");
const { CloudApiClient } = require("./services/cloudApiClient.service");
const { definirClienteWhatsApp } = require("./services/whatsappRuntime.service");

const QRCode = require("qrcode");

const {
  processarWebhookPagamento
} = require("./services/pagamento.webhook.service");
const {
  confirmarPedidoPagamentoLocal
} = require("./services/monitoramento/pedidos.service");
const {
  buscarEnderecoPedido,
  formatarEnderecoAtendente,
  excluirEnderecoPedido
} = require("./services/enderecoPedido.service");
const {
  salvarCliente
} = require("./services/marketing.service");

const {
  atendimento
} = require("./flows/atendimento.coordenador");
const {
  protegerResposta
} = require("./services/respostaSegura.service");
const {
  botDeveFuncionarHoje,
  obterHorarioConfigurado,
  obterConfiguracaoPainel
} = require("./services/painel.service");
const {
  processarComandoEstoqueAtendente,
  obterNumeroRemetente,
  ehNumeroAtendente
} = require("./services/comandoEstoqueAtendente.service");

const app = express();

app.use(express.json({
  limit: "5mb",
  verify: (req, res, buf) => {
    req.rawBody = buf.toString("utf8");
  }
}));

// ================================
// CLIENT
// ================================

const whatsappProvider = String(process.env.WHATSAPP_PROVIDER || "baileys").toLowerCase();
const usandoCloudApi = whatsappProvider === "cloud_api";
const client = usandoCloudApi
  ? new CloudApiClient()
  : new BaileysClient({ clientId: "bot1-pizzaria" });
definirClienteWhatsApp(client);

// ================================
// WEBHOOKS
// ================================

app.get("/webhook/whatsapp", (req, res) => {
  if (!usandoCloudApi) return res.sendStatus(404);
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === client.verifyToken
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

app.post("/webhook/whatsapp", (req, res) => {
  if (!usandoCloudApi) return res.sendStatus(404);
  if (!client.verificarAssinatura(req.rawBody, req.get("x-hub-signature-256"))) {
    return res.sendStatus(401);
  }
  try {
    client.processarWebhook(req.body);
    return res.sendStatus(200);
  } catch (erro) {
    console.error("ERRO WEBHOOK WHATSAPP CLOUD API:", erro);
    return res.sendStatus(500);
  }
});
app.post("/webhook/pagamento", async (req, res) => {
  console.log("WEBHOOK PAGAMENTO RECEBIDO:", req.body);

  try {
    await processarWebhookPagamento(req.body, client);
    res.sendStatus(200);
  } catch (err) {
    console.log("ERRO WEBHOOK PAGAMENTO APP:", err);
    res.sendStatus(500);
  }
});

app.post("/webhook/cliente", (req, res) => {
  try {
    const endereco = buscarEnderecoPedido(req.body?.pedidoId);

    if (!endereco?.cliente || !endereco?.contato) {
      return res.status(400).json({
        erro: "Cliente ou contato não encontrado."
      });
    }

    salvarCliente(endereco.cliente, endereco.contato);
    res.sendStatus(200);
  } catch (err) {
    console.error("ERRO AO SALVAR CONTATO DE MARKETING:", err);
    res.sendStatus(500);
  }
});

app.post("/webhook/pedido-offline", async (req, res) => {
  try {
    const pedidoId = String(req.body?.pedidoId || "");
    const endereco = buscarEnderecoPedido(pedidoId);

    // Valide os dados antes de alterar o status ou baixar o estoque. Assim um
    // checkout incompleto nunca é consumido por uma tentativa com falha.
    if (!endereco) {
      return res.status(400).json({
        erro: "Dados de recebimento não encontrados."
      });
    }

    const pedido = confirmarPedidoPagamentoLocal(pedidoId);
    if (!pedido) return res.sendStatus(200);

    salvarCliente(pedido.cliente, endereco.contato);

    const numeroAtendente = `${String(process.env.ATENDENTE_WHATSAPP || "5514991818867").replace(/\D/g, "")}@c.us`;

    let atendenteAvisada = false;
    try {
      await client.sendMessage(
        numeroAtendente,
        formatarEnderecoAtendente(pedido.id, endereco, pedido)
      );
      atendenteAvisada = true;
    } catch (erro) {
      console.error("PEDIDO CONFIRMADO, MAS A ATENDENTE NAO FOI AVISADA:", erro.message);
    }

    try {
      await client.sendMessage(
        pedido.cliente,
      `✅ Pedido confirmado!

🍕 Pedido: ${pedido.id}
📦 Modalidade: ${
        endereco.modalidade === "salao"
          ? "Salão"
          : endereco.modalidade === "retirada"
            ? "Retirada"
            : "Entrega"
      }
💳 Pagamento: ${
        endereco.pagamento === "dinheiro"
          ? "Dinheiro"
          : "Cartão na maquininha"
      }

Seu pedido já foi enviado para a pizzaria.`
      );
    } catch (erro) {
      console.error("PEDIDO CONFIRMADO, MAS O CLIENTE NAO FOI AVISADO:", erro.message);
    }

    if (atendenteAvisada) excluirEnderecoPedido(pedido.id);

    res.status(200).json({ confirmado: true, atendenteAvisada });
  } catch (err) {
    console.error("ERRO PEDIDO OFFLINE:", err);
    res.sendStatus(500);
  }
});

// ================================
// EVENTOS DE DIAGNÓSTICO
// ================================

client.on("authenticated", () => {
  console.log("✅ AUTENTICADO");
});

client.on("auth_failure", msg => {
  console.log("❌ FALHA AUTH:", msg);
});

let botOnline = false;

client.on("loading_screen", (percent, message) => {
  if (!botOnline) {
    console.log(`${percent}% ${message}`);
  }
});

client.on("ready", async () => {
  botOnline = true;
  console.log("🚀 BOT ONLINE");

  try {
    const info = client.info;
    console.log("Número:", info.wid.user);
  } catch (e) {
    console.log("Erro ao obter info:", e);
  }
});

client.on("disconnected", reason => {
  botOnline = false;
  console.log("WhatsApp desconectado:", reason);
});
// ================================
// QR CODE
// ================================

client.on("qr", async qr => {
  try {
    const qrTerminal = await QRCode.toString(qr, {
      type: "terminal",
      small: true
    });
    console.log("ESCANEIE O QR CODE ABAIXO:");
    console.log(qrTerminal);
  } catch (erro) {
    console.error("Erro ao gerar o QR no terminal:", erro.message);
  }
});

// ================================
// MENSAGENS
// ================================

const mensagensProcessadas = new Map();
const filasAtendimento = new Map();
const botIniciadoEm = Math.floor(Date.now() / 1000);
const metricasAtendimento = { processadas: 0, lentas: 0, esperaMs: 0, respostaMs: 0, ultimaRespostaEm: null };

async function processarMensagemRecebida(msg, origemEvento, enfileiradaEm = Date.now()) {
  const inicio = Date.now();
  const esperaMs = inicio - enfileiradaEm;
  try {
    if (!msg || msg.fromMe) return;
    if (!msg.from || !/@(?:lid|c\.us)$/.test(msg.from)) return;
    if (msg.isStatus || msg.broadcast) return;
    if (msg._data?.isNewMsg === false) return;

    const timestamp = Number(msg.timestamp);
    if (Number.isFinite(timestamp) && timestamp < botIniciadoEm) {
      return;
    }

    if (!msg.body || !msg.body.trim()) {
      return;
    }

    const idMensagem = msg.id?._serialized;

    if (idMensagem && mensagensProcessadas.has(idMensagem)) {
      return;
    }

    if (idMensagem) {
      mensagensProcessadas.set(idMensagem, Date.now());
      setTimeout(() => mensagensProcessadas.delete(idMensagem), 5 * 60 * 1000);
    }

    console.log(
      `MENSAGEM RECEBIDA [${origemEvento}] de ${msg.from}: ${msg.body}`
    );

    protegerResposta(msg);
    if (await processarComandoEstoqueAtendente(msg)) return;

    const remetente = await obterNumeroRemetente(msg);
    if (ehNumeroAtendente(remetente)) {
      console.log(`MENSAGEM ADMINISTRATIVA IGNORADA: ${remetente}`);
      await msg.reply(
        "🔐 *ÁREA DA ATENDENTE*\n\n" +
        "Este número está cadastrado como atendente e não entra no fluxo de clientes.\n" +
        "Envie *estoque* para abrir o painel administrativo."
      );
      return;
    }
    if (!botDeveFuncionarHoje()) {
      const horario = obterHorarioConfigurado();
      const configuracao = obterConfiguracaoPainel();
      const nomesDias = {
        domingo: "domingo", segunda: "segunda-feira", terca: "terça-feira",
        quarta: "quarta-feira", quinta: "quinta-feira", sexta: "sexta-feira",
        sabado: "sábado"
      };
      const diasAbertos = Object.entries(configuracao.diasFuncionamento || {})
        .filter(([, ativo]) => ativo)
        .map(([dia]) => nomesDias[dia])
        .filter(Boolean);
      const diasTexto = diasAbertos.length === 7
        ? "Todos os dias"
        : diasAbertos.length
          ? diasAbertos.join(", ")
          : "Nenhum dia configurado";
      const horarioTexto = horario.abertura === horario.fechamento
        ? "24 horas nos dias de funcionamento"
        : `${horario.abertura} às ${horario.fechamento}`;
      const estadoTexto = configuracao.botAtivo
        ? "Estamos fechados no momento."
        : "Nosso atendimento está temporariamente pausado.";
      await msg.reply(
        `🕐 *${estadoTexto}*\n\n` +
        `📅 *Dias de atendimento:* ${diasTexto}\n` +
        `⏰ *Horário:* ${horarioTexto}\n\n` +
        "Envie uma nova mensagem dentro do horário e teremos prazer em atender você. 🍕"
      );
      return;
    }
    await atendimento(msg, client);
  } catch (e) {
    console.error("ERRO AO RESPONDER:", e);
  } finally {
    const respostaMs = Date.now() - inicio;
    metricasAtendimento.processadas += 1;
    metricasAtendimento.esperaMs = esperaMs;
    metricasAtendimento.respostaMs = respostaMs;
    metricasAtendimento.ultimaRespostaEm = new Date().toISOString();
    if (esperaMs > 5000 || respostaMs > 12000) {
      metricasAtendimento.lentas += 1;
      console.warn(`[SAÚDE] Atendimento lento: fila=${esperaMs}ms, resposta=${respostaMs}ms, filas=${filasAtendimento.size}`);
    }
  }
}

function enfileirarMensagem(msg, origemEvento) {
  const usuario = msg?.from || "sem-identificador";
  const enfileiradaEm = Date.now();
  const filaAnterior = filasAtendimento.get(usuario) || Promise.resolve();
  const filaAtual = filaAnterior
    .catch(() => {})
    .then(() => processarMensagemRecebida(msg, origemEvento, enfileiradaEm));

  filasAtendimento.set(usuario, filaAtual);

  filaAtual.finally(() => {
    if (filasAtendimento.get(usuario) === filaAtual) {
      filasAtendimento.delete(usuario);
    }
  });
}

client.on("message", msg => {
  enfileirarMensagem(msg, "message");
});


// Higiene e diagnóstico contínuo: evita acúmulo de referências em processos longos.
setInterval(() => {
  const limite = Date.now() - 10 * 60 * 1000;
  for (const [id, criadoEm] of mensagensProcessadas) {
    if (criadoEm < limite) mensagensProcessadas.delete(id);
  }
  if (filasAtendimento.size > 50) {
    console.warn(`[SAÚDE] Muitas filas simultâneas: ${filasAtendimento.size}`);
  }
}, 60 * 1000).unref();

// ================================
// Checkout e cardapio unificados no mesmo servico HTTP do bot.
app.use(require("./site/server"));

// START
// ================================

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    whatsapp: botOnline ? "online" : "iniciando",
    provider: usandoCloudApi ? "cloud_api" : "baileys",
    atendimento: {
      filas: filasAtendimento.size,
      processadas: metricasAtendimento.processadas,
      lentas: metricasAtendimento.lentas,
      ultimaEsperaMs: metricasAtendimento.esperaMs,
      ultimaRespostaMs: metricasAtendimento.respostaMs,
      ultimaRespostaEm: metricasAtendimento.ultimaRespostaEm
    }
  });
});

const PORTA_BOT = Number(process.env.PORT || 3000);
const servidor = app.listen(PORTA_BOT, "0.0.0.0", () => {
  console.log(`Webhooks rodando na porta ${PORTA_BOT}`);
});

let encerrando = false;
async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`${sinal} recebido; encerrando com seguranca...`);
  servidor.close();
  await Promise.allSettled([client.destroy()]);
  process.exit(0);
}
process.once("SIGTERM", () => encerrar("SIGTERM"));
process.once("SIGINT", () => encerrar("SIGINT"));

console.log("⏳ Inicializando WhatsApp...");

client.initialize()
  .then(() => {
    console.log("✅ client.initialize chamado com sucesso");
  })
  .catch(err => {
    console.error("❌ ERRO AO INICIALIZAR:", err);
  });

