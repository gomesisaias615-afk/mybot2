const http = require("http");
const fs = require("fs");
const path = require("path");

const porta = Number(process.env.PORT || 5000);
const pastaPublica = path.join(__dirname, "cardapio-public");
const pastaBot = process.env.BOT1_PATH || path.resolve(__dirname, "..");
const { garantirArquivo } = require("../services/dadosPersistentes.service");
const configuracaoCardapioPath = garantirArquivo("configuracaoCardapio.json", "data/configuracaoCardapio.json", {});
const precosService = require("../services/precos.service");
const { estoque, recarregarEstoque, produtoDisponivel } = require("../services/estoque.service");
const imagensProdutos = require("../services/imagemProduto.service");

function lerJson(caminho, padrao) {
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    return padrao;
  }
}

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const detalhesPizzas = {
  calabresa: { categoria: "tradicionais", ingredientes: "Mussarela, calabresa, cebola e orégano." },
  mussarela: { categoria: "tradicionais", ingredientes: "Molho de tomate, mussarela, tomate, azeitona e orégano." },
  portuguesa: { categoria: "tradicionais", ingredientes: "Mussarela, presunto, ovo, cebola, azeitona e orégano." },
  marguerita: { categoria: "tradicionais", ingredientes: "Mussarela, tomate, manjericão, azeitona e orégano." },
  napolitana: { categoria: "tradicionais", ingredientes: "Mussarela, tomate, parmesão, azeitona e orégano." },
  presunto: { categoria: "tradicionais", ingredientes: "Mussarela, presunto, molho de tomate e orégano." },
  milho: { categoria: "tradicionais", ingredientes: "Mussarela, milho, cebola, azeitona e orégano." },
  baiana: { categoria: "tradicionais", ingredientes: "Mussarela, calabresa moída, cebola, pimenta e orégano." },
  "alho e oleo": { categoria: "tradicionais", ingredientes: "Mussarela, alho dourado, azeite, parmesão e orégano." },
  atum: { categoria: "tradicionais", ingredientes: "Mussarela, atum, cebola, azeitona e orégano." },
  americana: { categoria: "tradicionais", ingredientes: "Mussarela, presunto, milho, ovo, bacon e orégano." },
  toscana: { categoria: "tradicionais", ingredientes: "Mussarela, linguiça toscana, cebola, azeitona e orégano." },
  escarola: { categoria: "tradicionais", ingredientes: "Mussarela, escarola refogada, alho, azeitona e orégano." },
  palmito: { categoria: "tradicionais", ingredientes: "Mussarela, palmito, tomate, azeitona e orégano." },
  mista: { categoria: "tradicionais", ingredientes: "Mussarela, presunto, calabresa, tomate e orégano." },
  caipira: { categoria: "tradicionais", ingredientes: "Mussarela, frango, milho, ervilha, catupiry e orégano." },
  "frango catupiry": { categoria: "especiais", ingredientes: "Mussarela, frango desfiado, catupiry e orégano." },
  "quatro queijos": { categoria: "especiais", ingredientes: "Mussarela, provolone, parmesão, catupiry e orégano." },
  pepperoni: { categoria: "especiais", ingredientes: "Mussarela, pepperoni, molho de tomate e orégano." },
  "bacon especial": { categoria: "especiais", ingredientes: "Mussarela, bacon crocante, tomate, cebola e orégano." },
  "carne seca com catupiry": { categoria: "especiais", ingredientes: "Mussarela, carne seca, catupiry, cebola e orégano." },
  "frango com bacon": { categoria: "especiais", ingredientes: "Mussarela, frango, bacon, catupiry e orégano." },
  "lombo canadense": { categoria: "especiais", ingredientes: "Mussarela, lombo canadense, cebola, azeitona e orégano." },
  "camarao especial": { categoria: "especiais", ingredientes: "Mussarela, camarão, catupiry, tomate e orégano." },
  "cinco queijos": { categoria: "especiais", ingredientes: "Mussarela, provolone, parmesão, gorgonzola, catupiry e orégano." },
  "file mignon": { categoria: "especiais", ingredientes: "Mussarela, filé mignon, cebola caramelizada e catupiry." },
  "strogonoff de carne": { categoria: "especiais", ingredientes: "Mussarela, strogonoff de carne, champignon e batata palha." },
  "costela barbecue": { categoria: "especiais", ingredientes: "Mussarela, costela desfiada, molho barbecue e cebola roxa." },
  "salmao especial": { categoria: "especiais", ingredientes: "Mussarela, salmão, cream cheese, alho-poró e orégano." },
  mexicana: { categoria: "especiais", ingredientes: "Mussarela, carne, pimentão, nachos, pimenta e molho especial." },
  nordestina: { categoria: "especiais", ingredientes: "Mussarela, carne seca, queijo coalho, cebola roxa e orégano." },
  "frango especial": { categoria: "especiais", ingredientes: "Mussarela, frango, palmito, bacon, catupiry e orégano." },
  chocolate: { categoria: "doces", ingredientes: "Chocolate ao leite e granulado." },
  "chocolate com morango": { categoria: "doces", ingredientes: "Chocolate ao leite, morangos e leite condensado." },
  "romeu e julieta": { categoria: "doces", ingredientes: "Mussarela, goiabada e leite condensado." },
  "banana com canela": { categoria: "doces", ingredientes: "Banana, açúcar, canela e leite condensado." },
  brigadeiro: { categoria: "doces", ingredientes: "Chocolate, brigadeiro cremoso e granulado." },
  "doce de leite": { categoria: "doces", ingredientes: "Doce de leite cremoso, mussarela e canela." },
  prestigio: { categoria: "doces", ingredientes: "Chocolate ao leite, coco ralado e leite condensado." },
  sensacao: { categoria: "doces", ingredientes: "Chocolate ao leite, morangos e creme de leite." },
  "ninho com nutella": { categoria: "doces", ingredientes: "Creme de leite Ninho, Nutella e leite condensado." },
  "banana com chocolate": { categoria: "doces", ingredientes: "Banana, chocolate ao leite, açúcar e canela." },
  pacoca: { categoria: "doces", ingredientes: "Doce de leite, paçoca triturada e leite condensado." },
  beijinho: { categoria: "doces", ingredientes: "Beijinho cremoso, coco ralado e leite condensado." },
  ovomaltine: { categoria: "doces", ingredientes: "Chocolate ao leite, creme de Ovomaltine e crocante." },
  churros: { categoria: "doces", ingredientes: "Doce de leite, açúcar, canela e pedaços de churros." },
  "coco com chocolate": { categoria: "doces", ingredientes: "Chocolate ao leite, coco fresco e leite condensado." },
  "chocolate branco": { categoria: "doces", ingredientes: "Chocolate branco, creme de leite e raspas de chocolate." }
};

function montarCardapio() {
  const catalogoPrecos = precosService.catalogo();
  const precosPizzas = catalogoPrecos.pizzas;
  const nomesBebidas = catalogoPrecos.nomesBebidas;
  const precosBebidas = catalogoPrecos.bebidas;
  recarregarEstoque();
  const estoqueAtual = estoque;
  const configuracao = lerJson(configuracaoCardapioPath, {
    categorias: { tradicionais: true, especiais: true, doces: true, bebidas: true },
    promocoes: {}
  });
  const categoriasAtivas = configuracao.categorias || {};
  // Etiquetas só aparecem para promoções reais salvas em preço de/por.
  const promocoesPizzas = new Set();
  const promocoesBebidas = new Set();

  const pizzas = Object.entries(precosPizzas).map(([nome, tamanhos]) => {
    const chave = normalizar(nome);
    const detalhes = detalhesPizzas[chave] || {
      categoria: "tradicionais",
      ingredientes: "Ingredientes selecionados e orégano."
    };
    const categoriaConfigurada = Object.entries(configuracao.pizzasPorCategoria || {})
      .find(([, nomes]) => nomes.includes(nome))?.[0];
    const categoria = categoriaConfigurada || detalhes.categoria;
    const tipoEstoque = categoria === "especiais" ? "acompanhamentos" : categoria === "doces" ? "combos" : "pizzas";

    return {
      tipo: "pizza",
      chave,
      nome,
      categoria,
      ingredientes: catalogoPrecos.ingredientesPizzas?.[nome] || detalhes.ingredientes,
      imagem: imagensProdutos.urlImagem(tipoEstoque, nome),
      estoque: Object.prototype.hasOwnProperty.call(estoqueAtual[tipoEstoque] || {}, chave) ? Number(estoqueAtual[tipoEstoque][chave]) : null,
      disponivel: produtoDisponivel(tipoEstoque, chave),
      promocao: promocoesPizzas.has(chave) || Object.values(catalogoPrecos.promocoes.pizzas?.[nome] || {}).some(precosService.ativa),
      promocoes: Object.fromEntries(Object.keys(tamanhos || {}).map(tamanho => [tamanho, precosService.ativa(catalogoPrecos.promocoes.pizzas?.[nome]?.[tamanho]) ? catalogoPrecos.promocoes.pizzas[nome][tamanho] : null])),
      precos: Object.fromEntries(Object.entries(tamanhos || {}).map(([tamanho, valor]) => [tamanho, precosService.ativa(catalogoPrecos.promocoes.pizzas?.[nome]?.[tamanho]) ? Number(catalogoPrecos.promocoes.pizzas[nome][tamanho].por) : Number(valor)]))
    };
  });

  const bebidas = Object.entries(nomesBebidas).map(([chave, dados]) => ({
    tipo: "bebida",
    chave,
    nome: dados.nome,
    categoria: "bebidas",
    ingredientes: "Bebida gelada para acompanhar seu pedido.",
    imagem: imagensProdutos.urlImagem("bebidas", chave),
    estoque: Object.prototype.hasOwnProperty.call(estoqueAtual.bebidas || {}, chave) ? Number(estoqueAtual.bebidas[chave]) : null,
    disponivel: produtoDisponivel("bebidas", chave),
    promocao: promocoesBebidas.has(chave) || precosService.ativa(catalogoPrecos.promocoes.bebidas?.[chave]),
    promocaoDetalhe: precosService.ativa(catalogoPrecos.promocoes.bebidas?.[chave]) ? catalogoPrecos.promocoes.bebidas[chave] : null,
    preco: precosService.ativa(catalogoPrecos.promocoes.bebidas?.[chave]) ? Number(catalogoPrecos.promocoes.bebidas[chave].por) : Number(precosBebidas[chave] || 0)
  }));

  return {
    pizzas: pizzas.filter(pizza => categoriasAtivas[pizza.categoria] !== false),
    bebidas: categoriasAtivas.bebidas === false ? [] : bebidas,
    configuracao: {
      categorias: categoriasAtivas,
      pizzaria: configuracao.pizzaria || {
        nome: "Nova pizzaria",
        nomeCurto: "",
        slogan: ""
      }
    },
    atualizadoEm: new Date().toISOString()
  };
}

const tipos = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

if (require.main === module) http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/cardapio") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(montarCardapio()));
    return;
  }

  const rota = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const arquivo = path.resolve(pastaPublica, `.${rota}`);

  if (!arquivo.startsWith(pastaPublica)) {
    res.writeHead(403).end("Acesso negado");
    return;
  }

  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404).end("Página não encontrada");
      return;
    }

    res.writeHead(200, {
      "Content-Type": tipos[path.extname(arquivo).toLowerCase()] || "application/octet-stream"
    });
    res.end(conteudo);
  });
}).listen(porta, () => {
  console.log(`🍕 Cardápio digital rodando em http://localhost:${porta}`);
});

module.exports = { montarCardapio };
