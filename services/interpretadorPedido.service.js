const NUMEROS = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10
};

const TAMANHOS = {
  p: "P",
  pequena: "P",
  pequeno: "P",
  m: "M",
  media: "M",
  medio: "M",
  g: "G",
  grande: "G",
  f: "F",
  familia: "F",
  familiar: "F"
};

const PALAVRAS_IGNORADAS = new Set([
  "a",
  "as",
  "com",
  "coloca",
  "colocar",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "eu",
  "favor",
  "faz",
  "fazer",
  "gelada",
  "gelado",
  "gostaria",
  "gostava",
  "manda",
  "mandar",
  "me",
  "mim",
  "mais",
  "pode",
  "poderia",
  "para",
  "pede",
  "pedir",
  "pizza",
  "pizzas",
  "por",
  "porfavor",
  "pra",
  "preciso",
  "quero",
  "queria",
  "sabor",
  "sabores",
  "so",
  "ser",
  "tamanho"
]);

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distanciaLevenshtein(a, b) {
  const anterior = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const atual = [i];

    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(
        atual[j - 1] + 1,
        anterior[j] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }

    for (let j = 0; j < atual.length; j++) {
      anterior[j] = atual[j];
    }
  }

  return anterior[b.length];
}

function palavrasParecidas(recebida, esperada) {
  if (recebida === esperada) return true;

  const a = recebida.replace(/s$/, "");
  const b = esperada.replace(/s$/, "");

  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;

  const limite = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.22));
  return distanciaLevenshtein(a, b) <= limite;
}

function aliasesPizza(nome) {
  const base = normalizar(nome);
  const aliases = new Set([base]);

  if (base === "frango catupiry") {
    aliases.add("frango com catupiry");
    aliases.add("frango c catupiry");
  }

  if (base === "quatro queijos") {
    aliases.add("4 queijos");
    aliases.add("quatro queijo");
  }

  if (base === "mussarela") {
    aliases.add("mucarela");
    aliases.add("mozarela");
    aliases.add("muzzarela");
  }

  return [...aliases];
}

function localizarItens(tokens, catalogo) {
  const encontrados = [];

  for (let inicio = 0; inicio < tokens.length; inicio++) {
    let melhor = null;

    for (const item of catalogo) {
      for (const alias of item.aliases) {
        const partesAlias = normalizar(alias).split(" ").filter(Boolean);
        const trecho = tokens.slice(inicio, inicio + partesAlias.length);

        if (trecho.length !== partesAlias.length) continue;

        const corresponde = trecho.every((palavra, indice) =>
          palavrasParecidas(palavra, partesAlias[indice])
        );

        if (
          corresponde &&
          (!melhor || partesAlias.length > melhor.tamanho)
        ) {
          melhor = {
            ...item,
            inicio,
            fim: inicio + partesAlias.length,
            tamanho: partesAlias.length
          };
        }
      }
    }

    if (melhor) {
      encontrados.push(melhor);
      inicio = melhor.fim - 1;
    }
  }

  return encontrados;
}

function lerQuantidade(tokens, inicio, limiteAnterior) {
  for (let i = inicio - 1; i >= Math.max(limiteAnterior, inicio - 6); i--) {
    const token = tokens[i];

    if (/^\d+$/.test(token)) {
      return Number(token);
    }

    if (NUMEROS[token]) {
      return NUMEROS[token];
    }
  }

  return 1;
}

function lerTamanho(tokens, item, proximoInicio, limiteAnterior) {
  for (let i = item.fim; i < Math.min(tokens.length, proximoInicio); i++) {
    if (TAMANHOS[tokens[i]]) {
      return TAMANHOS[tokens[i]];
    }
  }

  for (let i = item.inicio - 1; i >= limiteAnterior; i--) {
    if (TAMANHOS[tokens[i]]) {
      return TAMANHOS[tokens[i]];
    }
  }

  return null;
}

function palavrasDesconhecidas(tokens, encontrados) {
  const usados = new Set();

  for (const item of encontrados) {
    for (let i = item.inicio; i < item.fim; i++) {
      usados.add(i);
    }
  }

  return tokens.filter((token, indice) => {
    if (usados.has(indice)) return false;
    if (PALAVRAS_IGNORADAS.has(token)) return false;
    if (NUMEROS[token] || TAMANHOS[token]) return false;
    if (/^\d+$/.test(token)) return false;
    if (token.length <= 2) return false;

    return ![...PALAVRAS_IGNORADAS].some(palavra => {
      if (Math.min(token.length, palavra.length) < 5) return false;
      return distanciaLevenshtein(token, palavra) <= 2;
    });
  });
}

function interpretarPizzas(texto, pizzas) {
  const tokens = normalizar(texto).split(" ").filter(Boolean);
  const catalogo = pizzas.map(pizza => ({
    nome: pizza.nome,
    aliases: aliasesPizza(pizza.nome)
  }));
  const encontrados = localizarItens(tokens, catalogo);

  if (!encontrados.length) {
    return {
      itens: [],
      erros: ["Não consegui identificar um sabor do nosso cardápio."]
    };
  }

  const itens = [];
  const erros = [];

  encontrados.forEach((item, indice) => {
    const anteriorFim = indice ? encontrados[indice - 1].fim : 0;
    const proximoInicio = encontrados[indice + 1]?.inicio ?? tokens.length;
    const quantidade = lerQuantidade(tokens, item.inicio, anteriorFim);
    const tamanho = lerTamanho(tokens, item, proximoInicio, anteriorFim);

    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      erros.push(`A quantidade de ${item.nome} não é válida.`);
      return;
    }

    if (!tamanho) {
      erros.push(
        `Qual é o tamanho da pizza ${item.nome}: P, M, G ou F?`
      );
      return;
    }

    itens.push({
      sabor: item.nome,
      tamanho,
      quantidade
    });
  });

  const desconhecidas = palavrasDesconhecidas(tokens, encontrados);

  if (desconhecidas.length) {
    erros.push(
      `Não reconheci esta parte da mensagem: "${desconhecidas.join(" ")}".`
    );
  }

  return {
    itens,
    erros,
    palavrasDesconhecidas: desconhecidas
  };
}

function interpretarBebidas(texto, bebidas) {
  const tokens = normalizar(texto).split(" ").filter(Boolean);
  const catalogo = Object.entries(bebidas).map(([chave, bebida]) => ({
    chave,
    nome: bebida.nome,
    aliases: [
      ...(bebida.aliases || []),
      bebida.nome,
      chave
    ]
  }));
  const encontrados = localizarItens(tokens, catalogo);

  if (!encontrados.length) {
    return {
      itens: [],
      erros: ["Não consegui identificar uma bebida do nosso cardápio."]
    };
  }

  const itens = [];
  const erros = [];

  encontrados.forEach((item, indice) => {
    const anteriorFim = indice ? encontrados[indice - 1].fim : 0;
    const quantidade = lerQuantidade(tokens, item.inicio, anteriorFim);

    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      erros.push(`A quantidade de ${item.nome} não é válida.`);
      return;
    }

    itens.push({
      chave: item.chave,
      nome: item.nome,
      quantidade
    });
  });

  const desconhecidas = palavrasDesconhecidas(tokens, encontrados);

  if (desconhecidas.length) {
    erros.push(
      `Não reconheci esta parte da mensagem: "${desconhecidas.join(" ")}".`
    );
  }

  return {
    itens,
    erros,
    palavrasDesconhecidas: desconhecidas
  };
}

module.exports = {
  interpretarPizzas,
  interpretarBebidas
};

