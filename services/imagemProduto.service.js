const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { diretorioDados, garantirArquivo } = require("./dadosPersistentes.service");

const metadadosPath = garantirArquivo("imagensprodutos.json", null, { pizzas: {}, bebidas: {} });
const imagensDir = path.join(diretorioDados, "imagens-produtos");
fs.mkdirSync(imagensDir, { recursive: true });

function ler() {
  try {
    const dados = JSON.parse(fs.readFileSync(metadadosPath, "utf8"));
    return { pizzas: dados.pizzas || {}, bebidas: dados.bebidas || {} };
  } catch {
    return { pizzas: {}, bebidas: {} };
  }
}
function salvar(dados) {
  fs.writeFileSync(metadadosPath, JSON.stringify(dados, null, 2), "utf8");
}
function tipoValido(tipo) {
  if (!["pizzas", "bebidas"].includes(tipo)) throw new Error("Tipo de produto inválido.");
  return tipo;
}
function chaveArquivo(tipo, chave) {
  return crypto.createHash("sha256").update(`${tipo}:${chave}`).digest("hex");
}
function obter(tipo, chave) {
  tipoValido(tipo);
  return ler()[tipo][chave] || null;
}
function salvarImagem(tipo, chave, dataUrl) {
  tipoValido(tipo);
  const achado = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!achado) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  const buffer = Buffer.from(achado[2], "base64");
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 3 MB.");
  const extensao = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[achado[1]];
  const arquivo = `${chaveArquivo(tipo, chave)}.${extensao}`;
  const dados = ler();
  const anterior = dados[tipo][chave];
  if (anterior?.arquivo && anterior.arquivo !== arquivo) {
    try { fs.unlinkSync(path.join(imagensDir, path.basename(anterior.arquivo))); } catch {}
  }
  fs.writeFileSync(path.join(imagensDir, arquivo), buffer);
  dados[tipo][chave] = { arquivo, mime: achado[1], atualizadoEm: Date.now() };
  salvar(dados);
  return dados[tipo][chave];
}
function removerImagem(tipo, chave) {
  tipoValido(tipo);
  const dados = ler();
  const atual = dados[tipo][chave];
  if (atual?.arquivo) {
    try { fs.unlinkSync(path.join(imagensDir, path.basename(atual.arquivo))); } catch {}
  }
  delete dados[tipo][chave];
  salvar(dados);
}
function caminhoImagem(tipo, chave) {
  const item = obter(tipo, chave);
  if (!item?.arquivo) return null;
  const arquivo = path.join(imagensDir, path.basename(item.arquivo));
  return fs.existsSync(arquivo) ? { arquivo, mime: item.mime, atualizadoEm: item.atualizadoEm } : null;
}
function urlImagem(tipo, chave) {
  const item = obter(tipo, chave);
  return item ? `/cardapio/imagem/${encodeURIComponent(tipo)}/${encodeURIComponent(chave)}?v=${item.atualizadoEm}` : null;
}

module.exports = { obter, salvarImagem, removerImagem, caminhoImagem, urlImagem };

