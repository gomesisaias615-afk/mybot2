
function nomeBebidaNoResumo(bebida, bebidas) {
  const nomeOriginal = String(bebida?.nome || "Bebida").trim();
  const volume = nomeOriginal.match(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|litro(?:s)?)\b/i)?.[0] || "";
  const semVolume = nomeOriginal
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|litro(?:s)?)\b/ig, " ")
    .replace(/\b([a-zÀ-ÿ]+)(?:\s+\1\b)+/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const mesmaBebida = item => String(item?.nome || "")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|litro(?:s)?)\b/ig, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR") === semVolume.toLocaleLowerCase("pt-BR");
  const precisaVolume = bebidas.filter(mesmaBebida).length > 1;
  return `${semVolume}${precisaVolume && volume ? ` ${volume}` : ""}`.trim();
}

function gerarResumo(user, carrinhoPizza, carrinhoBebida) {

  let txt = "🧾 RESUMO DO PEDIDO\n\n";

  let total = 0;

  // ================= PIZZAS =================

  if (Array.isArray(carrinhoPizza[user]) && carrinhoPizza[user].length > 0) {

    txt += "🍕 PIZZAS\n\n";

    carrinhoPizza[user].forEach(p => {

      const subtotal =
        p.quantidade * p.valor;

      total += subtotal;

      txt +=
        `${p.quantidade}x ${p.sabor} ${p.tamanho}\n`;

      txt +=
        `💰 R$ ${subtotal.toFixed(2).replace(".", ",")}\n\n`;
    });

  }

  // ================= BEBIDAS =================

  if (Array.isArray(carrinhoBebida[user]) && carrinhoBebida[user].length > 0) {

    txt += "🥤 BEBIDAS\n\n";

    carrinhoBebida[user].forEach(b => {

      const subtotal =
        b.quantidade * b.valor;

      total += subtotal;

      txt +=
        `${b.quantidade}x ${nomeBebidaNoResumo(b, carrinhoBebida[user])}\n`;

      txt +=
        `💰 R$ ${subtotal.toFixed(2).replace(".", ",")}\n\n`;

    });

  }

  txt +=
  `━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL DO PEDIDO: R$ ${total.toFixed(2).replace(".", ",")}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  txt +=
    "Deseja continuar?\n\n" +
    "1️⃣ Sim\n" +
    "2️⃣ Não";

  return txt;

}

module.exports = {
  gerarResumo
};
