const fs = require("fs");
const webpush = require("web-push");
const { garantirArquivo } = require("./dadosPersistentes.service");

const arquivoChaves = garantirArquivo("webpush-vapid.json", null, {});
const arquivoAssinaturas = garantirArquivo("webpush-assinaturas.json", null, []);

function ler(arquivo, padrao) {
  try { return JSON.parse(fs.readFileSync(arquivo, "utf8")); } catch { return padrao; }
}
function salvar(arquivo, dados) {
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), "utf8");
}

let chaves = {
  publicKey: String(process.env.VAPID_PUBLIC_KEY || "").trim(),
  privateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim()
};
if (!chaves.publicKey || !chaves.privateKey) chaves = ler(arquivoChaves, {});
if (!chaves.publicKey || !chaves.privateKey) {
  chaves = webpush.generateVAPIDKeys();
  salvar(arquivoChaves, chaves);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:mybot@localhost", chaves.publicKey, chaves.privateKey);

function chavePublica() { return chaves.publicKey; }

function salvarAssinatura(assinatura) {
  if (!assinatura?.endpoint || !assinatura?.keys?.p256dh || !assinatura?.keys?.auth) throw new Error("Assinatura de notificações inválida.");
  const assinaturas = ler(arquivoAssinaturas, []);
  const indice = assinaturas.findIndex(item => item.endpoint === assinatura.endpoint);
  const registro = { endpoint: assinatura.endpoint, expirationTime: assinatura.expirationTime || null, keys: assinatura.keys, atualizadoEm: new Date().toISOString() };
  if (indice >= 0) assinaturas[indice] = registro; else assinaturas.push(registro);
  salvar(arquivoAssinaturas, assinaturas.slice(-100));
  return true;
}

async function notificarNovoPedido(pedido) {
  const assinaturas = ler(arquivoAssinaturas, []);
  if (!assinaturas.length) return { enviadas: 0 };
  const payload = JSON.stringify({
    title: "Novo pedido MyBot",
    body: `Pedido #${pedido.id} recebido. Abra o painel para atender.`,
    tag: `pedido-${pedido.id}`,
    url: "/painel/atendente"
  });
  const invalidas = new Set();
  let enviadas = 0;
  await Promise.all(assinaturas.map(async assinatura => {
    try { await webpush.sendNotification(assinatura, payload); enviadas += 1; }
    catch (erro) { if ([404, 410].includes(erro?.statusCode)) invalidas.add(assinatura.endpoint); }
  }));
  if (invalidas.size) salvar(arquivoAssinaturas, assinaturas.filter(item => !invalidas.has(item.endpoint)));
  return { enviadas };
}

module.exports = { chavePublica, salvarAssinatura, notificarNovoPedido };
