const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pagamentoConfig = require("../config/pagamento");

const DURACAO_LINK_MS = 40 * 60 * 1000;
const segredoPath = process.env.CHECKOUT_SECRET_FILE ||
  path.join(__dirname, "..", "config", ".checkout-secret");

function obterSegredo() {
  if (process.env.CHECKOUT_LINK_SECRET) {
    return process.env.CHECKOUT_LINK_SECRET;
  }

  try {
    return fs.readFileSync(segredoPath, "utf8").trim();
  } catch {
    const segredo = crypto.randomBytes(48).toString("base64url");
    fs.writeFileSync(segredoPath, segredo, { encoding: "utf8", mode: 0o600 });
    return segredo;
  }
}

function assinar(pedidoId, expiraEm) {
  return crypto
    .createHmac("sha256", obterSegredo())
    .update(`${pedidoId}.${expiraEm}`)
    .digest("base64url");
}

function criarLinkCheckout(pedidoId, tipo) {
  const url = new URL(
    pagamentoConfig.checkoutUrl || "https://seusite.com/checkout"
  );
  const expiraEm = Date.now() + DURACAO_LINK_MS;

  url.searchParams.set("pedido", pedidoId);
  url.searchParams.set("exp", String(expiraEm));
  url.searchParams.set("token", assinar(pedidoId, expiraEm));
  if (tipo) url.searchParams.set("tipo", tipo);

  return url.toString();
}

module.exports = { criarLinkCheckout };

