const { criarLinkPainel } = require("./painelEstoqueAuth.service");

const numeroAtendente = String(process.env.ATENDENTE_WHATSAPP || "5514991818867").replace(/\D/g, "");

function variantesNumero(numero) {
  const limpo = String(numero || "").replace(/\D/g, "");
  const nacional = limpo.startsWith("55") ? limpo.slice(2) : limpo;
  const variantes = new Set([limpo, nacional, `55${nacional}`]);

  // Algumas integrações brasileiras entregam o mesmo celular com ou sem o
  // nono dígito. Aceitar as duas formas evita tratar a atendente como cliente.
  if (/^\d{2}9\d{8}$/.test(nacional)) {
    const semNono = `${nacional.slice(0, 2)}${nacional.slice(3)}`;
    variantes.add(semNono);
    variantes.add(`55${semNono}`);
  } else if (/^\d{10}$/.test(nacional)) {
    const comNono = `${nacional.slice(0, 2)}9${nacional.slice(2)}`;
    variantes.add(comNono);
    variantes.add(`55${comNono}`);
  }

  return variantes;
}

function ehNumeroAtendente(numero) {
  const recebidos = variantesNumero(numero);
  return [...variantesNumero(numeroAtendente)].some(item => recebidos.has(item));
}

function normalizar(valor) {
  return String(valor || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
}

async function obterNumeroRemetente(msg) {
  if (String(msg.from).endsWith("@c.us")) return String(msg.from).split("@")[0].replace(/\D/g, "");
  try {
    const contato = await msg.getContact();
    return String(contato?.number || contato?.id?.user || "").replace(/\D/g, "");
  } catch { return ""; }
}

async function processarComandoEstoqueAtendente(msg) {
  const remetente = await obterNumeroRemetente(msg);
  if (!remetente || !ehNumeroAtendente(remetente)) return false;
  if (normalizar(msg.body) !== "estoque") return false;

  try {
    const { url } = criarLinkPainel(remetente);
    await msg.reply(
      "📦 *PAINEL DE ESTOQUE*\n\n" +
      "Olá! Seu acesso administrativo foi liberado.\n\n" +
      "No painel você poderá:\n" +
      "• consultar as quantidades disponíveis;\n" +
      "• pesquisar pizzas e bebidas;\n" +
      "• adicionar ou diminuir unidades;\n" +
      "• definir uma quantidade exata;\n" +
      "• marcar um produto como esgotado.\n\n" +
      "🔐 Por segurança, este link é exclusivo e ficará disponível por *15 minutos*. " +
      "Quando expirar, envie *estoque* novamente para receber um novo acesso.\n\n" + url
    );
  } catch (erro) {
    console.error("Erro ao criar acesso ao painel de estoque:", erro.message);
    await msg.reply("⚠️ Não foi possível liberar o painel agora. Tente novamente em alguns instantes.");
  }
  return true;
}

module.exports = {
  processarComandoEstoqueAtendente,
  obterNumeroRemetente,
  ehNumeroAtendente
};

