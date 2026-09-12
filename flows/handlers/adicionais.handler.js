const { normalizar, respostaSim, respostaNao } = require("../../utils/texto");
const { adicionaisDisponiveis, formatarAdicionais, localizarAdicional } = require("../adicionais");
const { interpretarAdicionaisComGroq, interpretarAdicionaisLocalmente } = require("../../services/groqCardapio.service");

async function perguntarObservacao(msg, user, contexto) {
  contexto.estados[user] = "perguntar_observacao_pizza";
  await msg.reply(`📝 *Deseja adicionar alguma observação ao pedido?*

Exemplos: “Sem cebola” ou “Carne mal passada”.

1️⃣ Sim
2️⃣ Não`);
}

function errosDeVinculoAdicional(texto, disponiveis) {
  const entrada = normalizar(texto);
  const nomeFlexivel = valor => normalizar(valor).split(" ")
    .filter(palavra => !["de", "da", "do", "das", "dos", "com", "e"].includes(palavra)).join(" ");
  const entradaFlexivel = nomeFlexivel(entrada);
  const produtosCitados = [...new Set(disponiveis.map(item => item.produto))]
    .filter(produto => entrada.includes(normalizar(produto)) || entradaFlexivel.includes(nomeFlexivel(produto)));
  if (!produtosCitados.length) return [];

  const adicionalFoiMencionado = nome => {
    const completo = normalizar(nome);
    const curto = completo.replace(/\b(extra|adicional)\b/g, "").replace(/\s+/g, " ").trim();
    const termos = [...new Set([completo, curto].filter(Boolean))];
    return termos.some(termo => {
      let inicio = entrada.indexOf(termo);
      while (inicio >= 0) {
        const dentroDeProduto = produtosCitados.some(produto => {
          const nomeProduto = normalizar(produto);
          const inicioProduto = entrada.indexOf(nomeProduto);
          return inicioProduto >= 0 && inicio >= inicioProduto && inicio < inicioProduto + nomeProduto.length;
        });
        if (!dentroDeProduto) return true;
        inicio = entrada.indexOf(termo, inicio + termo.length);
      }
      return false;
    });
  };
  const nomesAdicionais = [...new Set(disponiveis.map(item => item.nome))]
    .filter(adicionalFoiMencionado);
  return nomesAdicionais.flatMap(nome => {
    const opcoes = disponiveis.filter(item => normalizar(item.nome) === normalizar(nome));
    if (opcoes.some(item => produtosCitados.some(produto => normalizar(produto) === normalizar(item.produto)))) return [];
    const produtosPermitidos = [...new Set(opcoes.map(item => item.produto))];
    return [`O adicional *${nome}* não está disponível para *${produtosCitados.join(" ou ")}*. Disponível para: *${produtosPermitidos.join(" ou ")}*.`];
  });
}

async function oferecerAdicionais(msg, user, contexto) {
  const disponiveis = adicionaisDisponiveis(contexto.carrinhoPizza[user] || []);
  contexto.adicionaisDisponiveis[user] = disponiveis;
  if (!disponiveis.length) return perguntarObservacao(msg, user, contexto);

  contexto.estados[user] = "perguntar_adicionais";
  await msg.reply(`➕ *Adicionais disponíveis para os produtos do seu pedido:*

${formatarAdicionais(disponiveis)}

Deseja adicionar algum item?

1️⃣ Sim
2️⃣ Não`);
}

async function tratarAdicionais({ msg, user, contexto }) {
  const estado = contexto.estados[user];
  if (!['perguntar_adicionais', 'escolher_adicional', 'confirmar_adicionais', 'adicionar_outro_adicional'].includes(estado)) return false;

  if (estado === "perguntar_adicionais") {
    if (respostaNao(msg.body)) { await perguntarObservacao(msg, user, contexto); return true; }
    if (respostaSim(msg.body)) {
      contexto.estados[user] = "escolher_adicional";
      await msg.reply(`Digite um ou mais adicionais junto com os produtos.

Exemplos: “Bacon no Hambúrguer X” ou “Bacon no Combo da casa e cheddar no X-Salada”.

${formatarAdicionais(contexto.adicionaisDisponiveis[user] || [])}`);
      return true;
    }
    await msg.reply("Por favor, responda com 1 para Sim ou 2 para Não.");
    return true;
  }

  if (estado === "adicionar_outro_adicional") {
    if (respostaNao(msg.body)) { await perguntarObservacao(msg, user, contexto); return true; }
    if (respostaSim(msg.body)) { contexto.estados[user] = "escolher_adicional"; await msg.reply("Digite o nome do adicional e o nome do produto."); return true; }
    await msg.reply("Por favor, responda com 1 para Sim ou 2 para Não.");
    return true;
  }

  if (estado === "confirmar_adicionais") {
    if (respostaSim(msg.body)) {
      const pendentes = contexto.adicionaisPendentes[user] || [];
      contexto.adicionais[user] ||= [];
      for (const adicional of pendentes) {
        if (!contexto.adicionais[user].some(atual =>
          atual.produto === adicional.produto && atual.nome === adicional.nome
        )) contexto.adicionais[user].push(adicional);
      }
      delete contexto.adicionaisPendentes[user];
      await perguntarObservacao(msg, user, contexto);
      return true;
    }
    if (respostaNao(msg.body)) {
      delete contexto.adicionaisPendentes[user];
      contexto.estados[user] = "escolher_adicional";
      await msg.reply(`Sem problema. Digite novamente os adicionais e os produtos.

Exemplo: “Bacon e ovo no Combo de Frango”.

${formatarAdicionais(contexto.adicionaisDisponiveis[user] || [])}`);
      return true;
    }
    await msg.reply("Responda com 1 para confirmar os adicionais ou 2 para corrigir.");
    return true;
  }

  const disponiveis = contexto.adicionaisDisponiveis[user] || [];
  // O robô local é a fonte principal: ele só aceita o adicional quando ele
  // pertence exatamente ao produto citado. A IA fica restrita a casos em que
  // o robô não conseguiu ler a frase, normalmente por erro de digitação.
  const errosDeVinculo = errosDeVinculoAdicional(msg.body, disponiveis);
  let selecionados = interpretarAdicionaisLocalmente(msg.body, disponiveis);
  if (!selecionados.length && !errosDeVinculo.length) {
    try {
      selecionados = await interpretarAdicionaisComGroq(msg.body, disponiveis);
    } catch (erro) {
      console.warn(`IA de apoio indisponível para adicionais: ${erro.message}`);
      const adicionalLocal = localizarAdicional(msg.body, disponiveis);
      if (adicionalLocal) selecionados = [adicionalLocal];
    }
  }

  if (errosDeVinculo.length) {
    await msg.reply(`⚠️ *Não consegui incluir esses adicionais*\n\n${errosDeVinculo.join("\n")}\n\nEscolha somente os adicionais listados para cada produto.`);
    return true;
  }

  if (!selecionados.length) {
    await msg.reply(`Não consegui identificar o adicional. Escreva o adicional junto com o produto, por exemplo: “Bacon no Combo da casa”.

${formatarAdicionais(disponiveis)}`);
    return true;
  }

  contexto.adicionaisPendentes[user] = selecionados;
  const itensConfirmados = selecionados.map(adicional =>
    `• *${adicional.nome}* — R$ ${adicional.valor.toFixed(2).replace(".", ",")}\n  ↳ ${adicional.produto}`
  ).join("\n\n");
  await msg.reply(`✅ *CONFIRA OS ADICIONAIS*

${itensConfirmados}

────────────────────`);
  contexto.estados[user] = "confirmar_adicionais";
  await msg.reply("Está tudo certo?\n\n1️⃣ Confirmar\n2️⃣ Corrigir");
  return true;
}

module.exports = { tratarAdicionais, oferecerAdicionais };
