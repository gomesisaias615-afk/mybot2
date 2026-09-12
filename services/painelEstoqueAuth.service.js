const crypto = require("crypto");

const DURACAO_MS = 15 * 60 * 1000;

function segredo() {
  return process.env.ADMIN_PANEL_SECRET
    || process.env.CHECKOUT_LINK_SECRET
    || process.env.MONGODB_URI;
}

function assinar(expiraEm, atendente) {
  const chave = segredo();
  if (!chave) throw new Error("Configure ADMIN_PANEL_SECRET no Render.");
  return crypto.createHmac("sha256", chave)
    .update(`estoque.${expiraEm}.${atendente}`)
    .digest("base64url");
}

function criarLinkPainel(atendente) {
  const base = String(
    process.env.PUBLIC_URL
    || process.env.RENDER_EXTERNAL_URL
    || "https://mybotserver-m5or.onrender.com"
  ).replace(/\/$/, "");
  const expiraEm = Date.now() + DURACAO_MS;
  const url = new URL(`${base}/admin/estoque`);
  url.searchParams.set("exp", String(expiraEm));
  url.searchParams.set("at", atendente);
  url.searchParams.set("token", assinar(expiraEm, atendente));
  return { url: url.toString(), expiraEm };
}

function validarAcesso({ exp, at, token }) {
  const expiraEm = Number(exp);
  const atendente = String(at || "").replace(/\D/g, "");
  if (!Number.isSafeInteger(expiraEm) || Date.now() > expiraEm || !atendente || !token) return false;
  const esperado = Buffer.from(assinar(expiraEm, atendente));
  const recebido = Buffer.from(String(token));
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

module.exports = { criarLinkPainel, validarAcesso };


