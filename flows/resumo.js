function moeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

function tipoDoProduto(produto) {
  const categoria = String(produto?.categoria || "").toLowerCase();
  const nome = String(produto?.sabor || produto?.sabores?.[0] || "").toLowerCase();
  if (categoria === "doces" || nome.startsWith("combo")) return { icone: "🍱", rotulo: "Combo" };
  if (categoria === "especiais" || nome.startsWith("acompanhamento")) return { icone: "🍟", rotulo: "Acompanhamento" };
  return { icone: "🍔", rotulo: "Hambúrguer" };
}

function gerarResumo(user, carrinhoPizza, carrinhoBebida, adicionais = {}) {
  let texto = "🧾 RESUMO DO PEDIDO\n\n";
  let total = 0;
  const pizzas = carrinhoPizza[user] || [];
  const bebidas = carrinhoBebida[user] || [];
  const extras = adicionais[user] || [];

  if (pizzas.length) {
    texto += "📦 *ITENS DO PEDIDO*\n\n";
    for (const produto of pizzas) {
      const subtotal = Number(produto.quantidade || 0) * Number(produto.valor || 0);
      const tipo = tipoDoProduto(produto);
      const nome = produto.sabor || produto.sabores?.join(" / ") || "Produto";
      total += subtotal;
      texto += `${tipo.icone} *${produto.quantidade}x ${tipo.rotulo}: ${nome}*\n`;
      texto += `   💰 ${moeda(subtotal)}\n\n`;
    }
  }

  if (extras.length) {
    texto += "➕ ADICIONAIS\n\n";
    for (const adicional of extras) {
      total += Number(adicional.valor) || 0;
      texto += `➕ *${adicional.nome}*\n`;
      texto += `   ↳ ${adicional.produto} · ${moeda(adicional.valor)}\n\n`;
    }
  }

  if (bebidas.length) {
    texto += "🥤 BEBIDAS\n\n";
    for (const bebida of bebidas) {
      const subtotal = Number(bebida.quantidade || 0) * Number(bebida.valor || 0);
      total += subtotal;
      texto += `🥤 *${bebida.quantidade}x Bebida: ${bebida.nome}*\n`;
      texto += `   💰 ${moeda(subtotal)}\n\n`;
    }
  }

  return `${texto}────────────────────\n💵 *TOTAL: ${moeda(total)}*\n\nDeseja continuar?\n\n1️⃣ Sim\n2️⃣ Não`;
}

module.exports = { gerarResumo };
