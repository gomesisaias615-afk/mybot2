const fs = require("fs");
const path = require("path");

function lerVariavelEnv(caminhoArquivo, nome) {
  try {
    const linha = fs
      .readFileSync(caminhoArquivo, "utf8")
      .split(/\r?\n/)
      .find(item => item.trim().startsWith(`${nome}=`));

    if (!linha) return "";

    let valor = linha.slice(linha.indexOf("=") + 1).trim();

    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    return valor;
  } catch {
    return "";
  }
}

const sitePagEnv =
  process.env.SITEPAG_ENV_FILE ||
  path.resolve(__dirname, "..", "..", "SitePag", ".env");

const accessTokenMercadoPago =
  process.env.MP_ACCESS_TOKEN ||
  process.env.MERCADO_PAGO_ACCESS_TOKEN ||
  lerVariavelEnv(sitePagEnv, "MP_ACCESS_TOKEN");

const publicKeyMercadoPago =
  process.env.MP_PUBLIC_KEY ||
  process.env.MERCADO_PAGO_PUBLIC_KEY ||
  lerVariavelEnv(sitePagEnv, "MP_PUBLIC_KEY") ||
  lerVariavelEnv(sitePagEnv, "MERCADO_PAGO_PUBLIC_KEY");

const checkoutUrl =
  process.env.CHECKOUT_URL ||
  `${process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "https://mybotserver-k1w8.onrender.com"}/checkout`;

function resolverWebhookUrl() {
  const configurada = String(process.env.MP_WEBHOOK_URL || "").trim();
  const publica = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
  const configuradaTemporaria = /(?:ngrok(?:-free)?\.(?:app|io)|localhost|127\.0\.0\.1)/i.test(configurada);

  if (configurada && /^https:\/\//i.test(configurada) && !configuradaTemporaria) {
    return configurada.replace(/\/$/, "");
  }

  if (publica && /^https:\/\//i.test(publica)) {
    return `${publica.replace(/\/$/, "")}/webhook/pagamento`;
  }

  return "";
}

const webhookUrlMercadoPago = resolverWebhookUrl();

const credenciaisMercadoPago = {
  accessToken: accessTokenMercadoPago,
  webhookUrl: webhookUrlMercadoPago,
  payerEmailPadrao: process.env.MP_PAYER_EMAIL || "cliente@example.com"
};

module.exports = {
  checkoutUrl,
  webhookUrlMercadoPago,
  publicKeyMercadoPago,

  pix: {
    provedor: "mercado_pago",
    credenciais: credenciaisMercadoPago
  },

  cartao: {
    provedor: "mercado_pago",
    credenciais: credenciaisMercadoPago
  },

  webhook: {
    provedor: "mercado_pago",
    credenciais: credenciaisMercadoPago
  }
};


