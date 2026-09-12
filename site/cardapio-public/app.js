const telaInicial = document.querySelector("#telaInicial");
const telaCategoria = document.querySelector("#telaCategoria");
const tituloCategoria = document.querySelector("#tituloCategoria");
const listaProdutos = document.querySelector("#listaProdutos");
const busca = document.querySelector("#busca");
const limparBusca = document.querySelector("#limparBusca");
const semResultado = document.querySelector("#semResultado");
const sincronizacao = document.querySelector("#sincronizacao");

const titulos = {
  tradicionais: "Pizzas Tradicionais",
  especiais: "Pizzas Especiais",
  bebidas: "Bebidas",
  doces: "Pizzas Doces"
};

let categoriaAtual = "";
let produtosAtuais = [];

function caminhoApiCardapio() {
  const prefixoPublico = window.location.pathname.startsWith("/cardapio")
    ? "/cardapio"
    : "";
  return `${prefixoPublico}/api/cardapio`;
}

function aplicarCategoriasAtivas(dados) {
  const pizzaria = dados.configuracao?.pizzaria || {};
  const nome = window.identidadePizzaria?.nome || "Nova pizzaria";
  document.title = `Cardápio Digital | ${nome}`;
  document.querySelector("#nomePizzaria").textContent = nome;
  document.querySelector("#nomePizzariaBanner").textContent = nome;
  document.querySelector("#nomePizzariaCategoria").textContent = nome;
  document.querySelector("#sloganPizzaria").textContent =
    pizzaria.slogan || "";

  document.querySelectorAll("[data-categoria]").forEach(botao => {
    const categoria=botao.dataset.categoria; const itens=categoria==="bebidas"?dados.bebidas:(dados.pizzas||[]).filter(p=>p.categoria===categoria); const temPromo=itens.some(item=>item.promocao); botao.classList.toggle("hidden",dados.configuracao?.categorias?.[categoria]===false); botao.classList.toggle("categoria-em-promocao",temPromo); let selo=botao.querySelector(".selo-categoria-promo"); if(temPromo&&!selo){selo=document.createElement("em");selo.className="selo-categoria-promo";selo.textContent="🔥 Promoções";botao.append(selo)} if(!temPromo&&selo)selo.remove();
  });
}

function normalizar(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function precosPizza(precos, promocoes = {}) {
  const tamanhos = { P: "Pequena", M: "Média", G: "Grande", F: "Família" };
  return Object.entries(precos || {}).map(([tamanho, valor]) =>
    `<span><b>${tamanho}</b><small>${tamanhos[tamanho] || tamanho}</small>${promocoes[tamanho] ? `<del>${dinheiro(promocoes[tamanho].de)}</del>` : ""}<strong>${dinheiro(valor)}</strong></span>`
  ).join("");
}

function escaparHtml(texto) { const el = document.createElement("div"); el.textContent = String(texto || ""); return el.innerHTML; }

function cardProduto(produto) {
  const indisponivel = produto.disponivel ? "" : " indisponivel";
  const preco = produto.tipo === "pizza"
    ? `<div class="grade-precos">${precosPizza(produto.precos, produto.promocoes)}</div>`
    : `<div class="preco-bebida">${produto.promocaoDetalhe ? `<em class="promocao">${produto.promocaoDetalhe.nome}</em><del>${dinheiro(produto.promocaoDetalhe.de)}</del>` : ""}<strong>${dinheiro(produto.preco)}</strong></div>`;

  const etiquetas = `${produto.promocao ? "<em class=\"promocao\">🔥 Promoção</em>" : ""}${produto.disponivel ? "" : "<em>Indisponível</em>"}`;

  return `<article class="produto${indisponivel}${produto.promocao ? " em-promocao" : ""}">
    <div class="produto-imagem ${produto.imagem ? "com-foto" : "sem-foto"}">${produto.imagem ? `<img src="${produto.imagem}" alt="${escaparHtml(produto.nome)}" loading="lazy">` : `<span aria-hidden="true">${produto.tipo === "bebida" ? "🥤" : "🍕"}</span>`}</div>
    <div class="produto-info">
      <div class="produto-topo"><h2>${produto.nome}</h2><div class="etiquetas">${etiquetas}</div></div>
      <p>${produto.ingredientes}</p>
      ${preco}
    </div>
  </article>`;
}

function renderizar() {
  const termo = normalizar(busca.value.trim());
  const filtrados = produtosAtuais.filter(produto =>
    normalizar(`${produto.nome} ${produto.ingredientes}`).includes(termo)
  );

  listaProdutos.innerHTML = filtrados.map(cardProduto).join("");
  semResultado.classList.toggle("hidden", filtrados.length > 0);
  limparBusca.classList.toggle("hidden", !busca.value);
}

async function abrirCategoria(categoria) {
  categoriaAtual = categoria;
  tituloCategoria.textContent = titulos[categoria];
  busca.value = "";
  listaProdutos.innerHTML = "";
  semResultado.classList.add("hidden");
  sincronizacao.classList.remove("hidden");
  telaInicial.classList.add("hidden");
  telaCategoria.classList.remove("hidden");
  window.scrollTo(0, 0);

  try {
    const resposta = await fetch(caminhoApiCardapio(), { cache: "no-store" });
    if (!resposta.ok) throw new Error("Não foi possível carregar o cardápio.");
    const dados = await resposta.json();
    aplicarCategoriasAtivas(dados);
    produtosAtuais = (categoria === "bebidas"
      ? dados.bebidas
      : categoria === "doces"
        ? dados.pizzas.filter(pizza => pizza.categoria === "doces")
        : dados.pizzas.filter(pizza => pizza.categoria === categoria)).sort((a,b)=>Number(b.promocao)-Number(a.promocao)||a.nome.localeCompare(b.nome,"pt-BR"));
    sincronizacao.classList.add("hidden");
    renderizar();
  } catch (erro) {
    sincronizacao.textContent = erro.message;
  }
}

document.querySelectorAll("[data-categoria]").forEach(botao => {
  botao.addEventListener("click", () => abrirCategoria(botao.dataset.categoria));
});

document.querySelector("#voltar").addEventListener("click", () => {
  telaCategoria.classList.add("hidden");
  telaInicial.classList.remove("hidden");
  window.scrollTo(0, 0);
});

busca.addEventListener("input", renderizar);
limparBusca.addEventListener("click", () => { busca.value = ""; renderizar(); busca.focus(); });

fetch(caminhoApiCardapio(), { cache: "no-store" })
  .then(resposta => resposta.ok ? resposta.json() : Promise.reject())
  .then(aplicarCategoriasAtivas)
  .catch(() => {});

