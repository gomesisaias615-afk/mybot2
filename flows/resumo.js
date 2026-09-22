
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

function gerarResumo(user, carrinhoPizza, carrinhoBebida, observacao = "") {

  let txt = "🧾 RESUMO DO PEDIDO\n\n";

  let total = 0;
  const bebidas = carrinhoBebida[user] || [];

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

  const combos = bebidas.filter(item => item.tipo === "combo");
  const bebidasNormais = bebidas.filter(item => item.tipo !== "combo");

  if (combos.length) {
    txt += "🍽️ COMBOS\n\n";
    combos.forEach(combo => {
      const subtotal = combo.quantidade * combo.valor;
      total += subtotal;
      txt += `${combo.quantidade}x ${combo.nome}\n`;
      txt += `💰 R$ ${subtotal.toFixed(2).replace(".", ",")}\n\n`;
    });
  }

  if (bebidasNormais.length) {
    txt += "🥤 BEBIDAS\n\n";
    bebidasNormais.forEach(bebida => {
      const subtotal = bebida.quantidade * bebida.valor;
      total += subtotal;
      txt += `${bebida.quantidade}x ${nomeBebidaNoResumo(bebida, bebidasNormais)}\n`;
      txt += `💰 R$ ${subtotal.toFixed(2).replace(".", ",")}\n\n`;
    });
  }
  if (String(observacao || "").trim()) {
    txt += `📝 OBSERVAÇÃO\n\n“${String(observacao).trim()}”\n\n`;
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
