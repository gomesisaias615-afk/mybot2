require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const { webhookUrlMercadoPago, publicKeyMercadoPago } = require("../config/pagamento");
const { validarAcesso } = require("../services/painelEstoqueAuth.service");
const { diretorioDados } = require("../services/dadosPersistentes.service");
const { obterIdentidade, logo: logoIdentidade } = require("../services/identidade.service");
const { estoque, recarregarEstoque, definirQuantidadeProduto } = require("../services/estoque.service");
const { obterConfiguracaoPainel } = require("../services/painel.service");

const app = express();
// Checkout, bot e painel devem ler o mesmo diretório persistente.
const botDir = diretorioDados;
const pedidosPath = path.join(botDir, "pedidos.json");
const enderecosPath = path.join(botDir, "enderecosPedidos.json");
const checkoutSecretPath = process.env.CHECKOUT_SECRET_FILE ||
  path.resolve(__dirname, "..", "config", ".checkout-secret");
const catalogoEnderecosPath = path.join(
  __dirname,
  "data",
  "enderecos-estancia.json"
);
const cardapioPublicPath = process.env.CARDAPIO_PUBLIC_DIR || path.join(__dirname, "cardapio-public");
const { montarCardapio } = require("./cardapio.server");
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});
const nominatimCache = new Map();
let filaNominatim = Promise.resolve();
let ultimaConsultaNominatim = 0;

function configuracaoEntrega() {
  return obterConfiguracaoPainel().entrega;
}


function configuracaoPizzariaPronta() {
  const config = configuracaoEntrega();
  const latitudeInformada = config.latitudePizzaria !== null && config.latitudePizzaria !== undefined && config.latitudePizzaria !== "";
  const longitudeInformada = config.longitudePizzaria !== null && config.longitudePizzaria !== undefined && config.longitudePizzaria !== "";
  const latitude = Number(config.latitudePizzaria);
  const longitude = Number(config.longitudePizzaria);
  return Boolean(
    String(config.enderecoPizzaria || "").trim() &&
    String(config.cidadeAtendida || "").trim() &&
    String(config.estadoAtendido || "").trim() &&
    latitudeInformada &&
    longitudeInformada &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function bloquearPedidoSemEndereco(res) {
  if (configuracaoPizzariaPronta()) return false;
  res.status(503).json({
    erro: "A pizzaria ainda está configurando o endereço de atendimento. Tente novamente mais tarde."
  });
  return true;
}

function paginaConfiguracaoPendente() {
  return `<!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Atendimento temporariamente indisponível</title>
    <style>
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f3faf6;color:#10271d;font-family:Arial,sans-serif}
      main{width:min(100%,560px);padding:34px;border:1px solid #cfe8db;border-radius:28px;background:#fff;box-shadow:0 18px 50px rgba(10,72,47,.12);text-align:center}
      span{display:grid;width:72px;height:72px;margin:0 auto 20px;place-items:center;border-radius:50%;background:#e2f7ec;font-size:36px}
      h1{margin:0 0 12px;font-size:clamp(27px,7vw,40px)}p{margin:0;color:#5c6d65;font-size:18px;line-height:1.55}
    </style>
  </head>
  <body><main><span>📍</span><h1>Pedidos temporariamente indisponíveis</h1><p>A pizzaria ainda está configurando o endereço de atendimento. Tente novamente mais tarde.</p></main></body>
  </html>`;
}

function calcularTotais(pedido, modalidade, taxaInformada = 0) {
  const valorPedido = Number(pedido?.total || 0);
  const taxaEntrega = modalidade === "entrega" ? Math.max(0, Number(taxaInformada) || 0) : 0;
  return {
    valorPedido: Number(valorPedido.toFixed(2)),
    taxaEntrega: Number(taxaEntrega.toFixed(2)),
    totalFinal: Number((valorPedido + taxaEntrega).toFixed(2))
  };
}

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function consultarNominatim(url) {
  const chave = url.toString();
  const cache = nominatimCache.get(chave);
  if (cache && cache.expiraEm > Date.now()) return cache.dados;

  const tarefa = filaNominatim.then(async () => {
    const espera = Math.max(0, 1300 - (Date.now() - ultimaConsultaNominatim));
    if (espera) await aguardar(espera);

    // O Nominatim público limita consultas. Em 429, aguarda e tenta de novo
    // em vez de impedir o cliente de confirmar o endereço.
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      ultimaConsultaNominatim = Date.now();
      const resposta = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "pt-BR",
          "User-Agent": "MyBot-Pizzarias/1.0 (consulta de enderecos)"
        },
        signal: AbortSignal.timeout(9000)
      });
      if (resposta.ok) {
        const dados = await resposta.json();
        nominatimCache.set(chave, { dados, expiraEm: Date.now() + 10 * 60 * 1000 });
        return dados;
      }
      if (resposta.status !== 429 || tentativa === 2) {
        throw new Error(`OpenStreetMap respondeu HTTP ${resposta.status}`);
      }
      const retryAfter = Number(resposta.headers.get("retry-after"));
      await aguardar(Number.isFinite(retryAfter) ? retryAfter * 1000 : 3000 * (tentativa + 1));
    }
    throw new Error("O mapa está temporariamente ocupado. Tente novamente em instantes.");
  });
  filaNominatim = tarefa.catch(() => {});
  return tarefa;
}

function enderecoDoNominatim(dados) {
  const endereco = dados?.address || {};
  const cidade = endereco.city || endereco.town || endereco.municipality || endereco.county || "";
  const estado = endereco.state_code || endereco["ISO3166-2-lvl4"]?.split("-").pop() || "";
  return {
    placeId: String(dados?.place_id || ""),
    texto: dados?.display_name || "",
    rua: endereco.road || endereco.pedestrian || endereco.residential || endereco.path || "",
    logradouro: endereco.road || endereco.pedestrian || endereco.residential || endereco.path || "",
    numero: endereco.house_number || "",
    bairro: endereco.suburb || endereco.neighbourhood || endereco.quarter || endereco.city_district || "",
    cidade,
    estado: String(estado || "").toUpperCase(),
    cep: String(endereco.postcode || "").replace(/\D/g, "").slice(0, 8),
    latitude: Number(dados?.lat),
    longitude: Number(dados?.lon),
    enderecoFormatado: dados?.display_name || "",
    atribuicao: "© OpenStreetMap contributors"
  };
}

function enderecoNaArea(endereco, config = configuracaoEntrega()) {
  const cidadeOk = normalizar(endereco.cidade).includes(normalizar(config.cidadeAtendida));
  const estadoInformado = normalizar(endereco.estado);
  const estadoOk = !estadoInformado || estadoInformado === normalizar(config.estadoAtendido) || estadoInformado.includes("sergipe");
  return cidadeOk && estadoOk;
}

function distanciaHaversineKm(lat1, lon1, lat2, lon2) {
  const rad = valor => valor * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function calcularTaxaEntrega(latitude, longitude) {
  const config = configuracaoEntrega();
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Selecione o endereço nas sugestões ou confirme o ponto no mapa.");
  }

  // O círculo do painel e a validação usam a mesma medida em linha reta.
  const distanciaAreaKm = distanciaHaversineKm(
    Number(config.latitudePizzaria),
    Number(config.longitudePizzaria),
    lat,
    lon
  );
  if (distanciaAreaKm > Number(config.distanciaMaximaKm)) {
    throw new Error(`Endereço fora do raio de ${config.distanciaMaximaKm} km da pizzaria.`);
  }

  if (config.modoTaxa === "fixa") {
    return {
      modoTaxa: "fixa",
      distanciaKm: null,
      distanciaAreaKm: Number(distanciaAreaKm.toFixed(2)),
      taxaEntrega: Number(Number(config.taxaFixa).toFixed(2))
    };
  }

  let distanciaKm;
  try {
    const origem = `${config.longitudePizzaria},${config.latitudePizzaria}`;
    const destino = `${lon},${lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${origem};${destino}?overview=false&alternatives=false&steps=false`;
    const resposta = await fetch(url, { headers: { "User-Agent": "MyBot-Pizzarias/1.0" }, signal: AbortSignal.timeout(9000) });
    if (!resposta.ok) throw new Error(`Rota HTTP ${resposta.status}`);
    const dados = await resposta.json();
    distanciaKm = Number(dados?.routes?.[0]?.distance) / 1000;
    if (!Number.isFinite(distanciaKm)) throw new Error("Rota não encontrada");
  } catch (erro) {
    console.warn("Rota OSRM indisponível; usando distância aproximada:", erro.message);
    distanciaKm = distanciaAreaKm * 1.25;
  }

  const taxaEntrega = Math.max(Number(config.taxaMinima), distanciaKm * Number(config.valorPorKm));
  return {
    modoTaxa: "por_km",
    distanciaKm: Number(distanciaKm.toFixed(2)),
    distanciaAreaKm: Number(distanciaAreaKm.toFixed(2)),
    taxaEntrega: Number(taxaEntrega.toFixed(2))
  };
}

function formatarCep(cep) {
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}

app.use(cors());
app.use(express.json({ limit: "3mb" }));

const cacheTilesMapa = new Map();
const LIMITE_CACHE_TILES = 500;

app.get("/api/mapa/tiles/:z/:x/:y.png", async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  const limite = Number.isInteger(z) && z >= 0 && z <= 19 ? 2 ** z : 0;
  if (!limite || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= limite || y >= limite) {
    return res.status(400).json({ erro: "Bloco de mapa inválido." });
  }

  const chave = z + "/" + x + "/" + y;
  const armazenado = cacheTilesMapa.get(chave);
  if (armazenado) {
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    return res.type("png").send(armazenado);
  }

  try {
    const fontes = [
      "https://tile.openstreetmap.org/" + chave + ".png",
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/" + chave + ".png"
    ];
    let imagem;
    for (const fonte of fontes) {
      try {
        const resposta = await fetch(fonte, {
          headers: {
            Accept: "image/png,image/*",
            "User-Agent": "MyBot-Pizzarias/1.0 (painel administrativo)"
          },
          signal: AbortSignal.timeout(10000)
        });
        if (!resposta.ok) continue;
        const tipo = String(resposta.headers.get("content-type") || "");
        if (!tipo.startsWith("image/")) continue;
        imagem = Buffer.from(await resposta.arrayBuffer());
        if (imagem.length) break;
      } catch {}
    }
    if (!imagem?.length) throw new Error("Nenhum servidor de mapa respondeu.");

    if (cacheTilesMapa.size >= LIMITE_CACHE_TILES) {
      cacheTilesMapa.delete(cacheTilesMapa.keys().next().value);
    }
    cacheTilesMapa.set(chave, imagem);
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.type("png").send(imagem);
  } catch (erro) {
    console.error("Erro ao carregar bloco do mapa:", erro.message);
    res.status(502).json({ erro: "O mapa não pôde ser carregado agora." });
  }
});




app.use((req, res, next) => {
  const caminho = req.path;
  const exigeEndereco =
    caminho === "/checkout" ||
    caminho === "/api/enderecos/calcular-entrega" ||
    /^\/api\/pedido\/[^/]+(?:\/.*)?$/.test(caminho) ||
    /^\/api\/pagamento\/[^/]+(?:\/.*)?$/.test(caminho);

  if (!exigeEndereco || configuracaoPizzariaPronta()) return next();

  if (caminho === "/checkout" && req.method === "GET") {
    res.set("Cache-Control", "no-store");
    return res.status(503).type("html").send(paginaConfiguracaoPendente());
  }
  return bloquearPedidoSemEndereco(res);
});

function protegerPainelEstoque(req, res, next) {
  try {
    if (!validarAcesso(req.query)) return res.status(410).json({ erro: "Acesso inválido ou expirado. Envie estoque novamente pelo WhatsApp." });
    next();
  } catch (erro) {
    console.error("Erro ao validar painel de estoque:", erro.message);
    res.status(503).json({ erro: "Painel temporariamente indisponível." });
  }
}

app.get("/admin/estoque", protegerPainelEstoque, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "estoque.html"));
});

app.get("/admin/api/estoque", protegerPainelEstoque, (req, res) => {
  recarregarEstoque();
  const produtos = ["pizzas", "bebidas"].flatMap(tipo =>
    Object.entries(estoque[tipo] || {}).map(([chave, quantidade]) => ({
      tipo, chave, nome: chave.replace(/_/g, " "), quantidade: Math.max(0, Number(quantidade) || 0)
    }))
  );
  res.set("Cache-Control", "no-store");
  res.json({ produtos });
});

app.patch("/admin/api/estoque", protegerPainelEstoque, (req, res) => {
  try {
    const quantidade = definirQuantidadeProduto(String(req.body?.tipo || ""), String(req.body?.chave || ""), req.body?.quantidade);
    res.json({ sucesso: true, quantidade });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});
app.get("/api/identidade",(q,s)=>s.json(obterIdentidade()));
app.get("/api/identidade/logo",(q,s)=>{const marca=obterIdentidade().logo||"";const dado=/^data:(image\/(?:png|jpeg|webp));base64,([\w+/=]+)$/i.exec(marca);if(dado)return s.type(dado[1]).set("Cache-Control","no-store").send(Buffer.from(dado[2],"base64"));if(fs.existsSync(logoIdentidade))return s.set("Cache-Control","no-store").sendFile(logoIdentidade);if(/^\/cardapio\/[a-z0-9._-]+$/i.test(marca))return s.redirect(302,marca);return s.redirect(302,"/cardapio/mascote-saborear.png")});
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect(302, "/cardapio/");
});

app.get(/^\/cardapio$/, (req, res) => {
  res.redirect(302, "/cardapio/");
});

app.get("/cardapio/api/cardapio", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(montarCardapio());
});

app.get("/cardapio/", (req, res) => {
  const basePublica = String(
    process.env.PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (req.protocol + "://" + req.get("host"))
  ).replace(/[/]$/, "");
  const pagina = fs
    .readFileSync(path.join(cardapioPublicPath, "index.html"), "utf8")
    .replaceAll("__PUBLIC_URL__", basePublica)
    .replaceAll("__CARDAPIO_URL__", basePublica + "/cardapio/")
    .replaceAll("__PIZZARIA_NOME__", obterIdentidade().nome)
    .replaceAll("__LOGO_PIZZARIA__", obterIdentidade().logo);
  res.set("Cache-Control", "no-store");
  res.type("html").send(pagina);
});
app.use("/cardapio", express.static(cardapioPublicPath, { index: false }));

function lerJson(caminho, padrao) {
  try {
    const conteudo = fs
      .readFileSync(caminho, "utf8")
      .replace(/^\uFEFF/, "");

    return JSON.parse(conteudo);
  } catch {
    return padrao;
  }
}

function buscarPedido(pedidoId) {
  return lerJson(pedidosPath, []).find(pedido => pedido.id === pedidoId);
}

function obterSegredoCheckout() {
  if (process.env.CHECKOUT_LINK_SECRET) {
    return process.env.CHECKOUT_LINK_SECRET;
  }

  return fs.readFileSync(checkoutSecretPath, "utf8").trim();
}

function validarAcessoPedido(req, res, pedido, opcoes = {}) {
  const repeticaoPagamentoLocal = opcoes.permitirPagamentoLocalConfirmado && pedido.pagamentoLocalConfirmado === true;
  if (pedido.status !== "aguardando_pagamento" && !repeticaoPagamentoLocal) {
    res.status(410).json({ erro: "Este link já foi utilizado e não está mais disponível." });
    return false;
  }

  const token = String(
    req.get("X-Checkout-Token") || req.query.token || ""
  );
  const expiraEm = Number(
    req.get("X-Checkout-Expires") || req.query.exp
  );

  if (!token || !Number.isSafeInteger(expiraEm) || Date.now() > expiraEm) {
    res.status(410).json({ erro: "Link inválido ou expirado. Solicite um novo link pelo WhatsApp." });
    return false;
  }

  try {
    const esperado = crypto
      .createHmac("sha256", obterSegredoCheckout())
      .update(`${pedido.id}.${expiraEm}`)
      .digest();
    const recebido = Buffer.from(token, "base64url");

    if (
      recebido.length !== esperado.length ||
      !crypto.timingSafeEqual(recebido, esperado)
    ) {
      res.status(403).json({ erro: "Link de pagamento inválido." });
      return false;
    }
  } catch (err) {
    console.error("Erro ao validar link do checkout:", err.message);
    res.status(503).json({ erro: "Não foi possível validar o link agora." });
    return false;
  }

  return true;
}

function emailComprador(pedidoId) {
  return `cliente-${String(pedidoId).replace(/\W/g, "")}@example.com`;
}

app.get("/api/config", (req, res) => {
  const entrega = configuracaoEntrega();
  res.set("Cache-Control", "no-store");
  res.json({
    publicKey: publicKeyMercadoPago,
    deliveryFee: entrega.modoTaxa === "fixa" ? entrega.taxaFixa : 0,
    configuracaoPendente: !configuracaoPizzariaPronta(),
    entrega
  });
});

app.get("/checkout", (req, res) => {
  const pedido = buscarPedido(String(req.query.pedido || ""));

  if (!pedido) {
    return res.status(404).send("Link de pagamento inválido.");
  }

  if (!validarAcessoPedido(req, res, pedido)) return;

  const basePublica = String(
    process.env.PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (req.protocol + "://" + req.get("host"))
  ).replace(/[/]$/, "");
  const pagina = fs
    .readFileSync(path.join(__dirname, "public", "checkout.html"), "utf8")
    .replaceAll("__PUBLIC_URL__", basePublica)
    .replaceAll("__CHECKOUT_URL__", basePublica + "/checkout")
    .replaceAll("__PIZZARIA_NOME__", obterIdentidade().nome);

  res.set("Cache-Control", "private, no-store");
  res.type("html").send(pagina);
});

app.get("/api/pedido/:pedidoId", (req, res) => {
  const pedido = buscarPedido(req.params.pedidoId);

  if (!pedido) {
    return res.status(404).json({ erro: "Pedido não encontrado." });
  }

  if (!validarAcessoPedido(req, res, pedido)) return;

  res.json(pedido);
});

app.get("/api/enderecos/sugestoes", async (req, res) => {
  const buscaOriginal = String(req.query.q || "").trim();
  const busca = expandirAbreviacoesEndereco(buscaOriginal);
  const config = configuracaoEntrega();
  const cidade = String(req.query.cidade || config.cidadeAtendida).trim();
  const estado = String(req.query.estado || config.estadoAtendido).trim().toUpperCase();
  if (buscaOriginal.length < 2 || !cidade || !estado) return res.json([]);
  const areaConsultada = {
    ...config,
    cidadeAtendida: cidade,
    estadoAtendido: estado
  };

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${busca}, ${cidade}, ${estado}, Brasil`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("limit", "8");
    const dados = await consultarNominatim(url);
    const resultados = dados.map(enderecoDoNominatim).filter(item =>
      enderecoNaArea(item, areaConsultada) &&
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude)
    );
    res.set("Cache-Control", "private, max-age=300");
    return res.json(resultados);
  } catch (erro) {
    console.error("Erro na busca do OpenStreetMap:", erro.message);
    if (normalizar(cidade) !== "estancia" || estado !== "SE") {
      return res.status(503).json({ erro: "O mapa não conseguiu pesquisar este endereço agora. Tente novamente." });
    }
    const termos = normalizar(busca).split(" ").filter(Boolean);
    const resultados = lerJson(catalogoEnderecosPath, [])
      .filter(item => {
        const alvo = normalizar(expandirAbreviacoesEndereco(`${item.logradouro} ${item.chaveBusca} ${item.bairro}`));
        return termos.every(termo => alvo.includes(termo));
      })
      .slice(0, 8)
      .map(item => ({
        placeId: item.id,
        texto: `${item.logradouro} — ${item.bairro}, Estância - SE`,
        rua: item.logradouro,
        logradouro: item.logradouro,
        bairro: item.bairro,
        cidade: "Estância",
        estado: "SE",
        cep: "",
        latitude: item.latitude,
        longitude: item.longitude
      }));
    return res.json(resultados);
  }
});

app.get("/api/enderecos/local/:placeId", async (req, res) => {
  const catalogo = lerJson(catalogoEnderecosPath, []);
  const endereco = catalogo.find(item => item.id === req.params.placeId);

  if (!endereco) {
    return res.status(404).json({ erro: "Endereço não encontrado." });
  }

  res.json({
    rua: endereco.logradouro,
    numero: "",
    bairro: endereco.bairro,
    cidade: modalidade === "entrega" ? cidade : configEntrega.cidadeAtendida,
    estado: modalidade === "entrega" ? estado : configEntrega.estadoAtendido,
    cep: "",
    enderecoFormatado:
      `${endereco.logradouro}, ${endereco.bairro}, Estância - SE`,
    latitude: endereco.latitude,
    longitude: endereco.longitude,
    nomeAmbiguo: endereco.nomeAmbiguo
  });
});

app.get("/api/enderecos/localizacao-atual", async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return res.status(400).json({ erro: "Coordenadas inválidas." });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    const dados = await consultarNominatim(url);
    const endereco = enderecoDoNominatim(dados);
    if (!enderecoNaArea(endereco)) {
      return res.status(400).json({ erro: `A localização está fora de ${configuracaoEntrega().cidadeAtendida} - ${configuracaoEntrega().estadoAtendido}.` });
    }
    res.set("Cache-Control", "no-store");
    res.json(endereco);
  } catch (erro) {
    console.error("Erro ao localizar endereço pelo GPS:", erro.message);
    res.status(503).json({ erro: erro.message || "Não foi possível identificar o endereço pelo GPS." });
  }
});

app.post("/api/enderecos/calcular-entrega", async (req, res) => {
  try {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    const localizado = enderecoDoNominatim(await consultarNominatim(url));
    if (!enderecoNaArea(localizado)) {
      return res.status(400).json({ erro: `Atendemos somente ${configuracaoEntrega().cidadeAtendida} - ${configuracaoEntrega().estadoAtendido}.` });
    }
    res.json(await calcularTaxaEntrega(latitude, longitude));
  } catch (erro) {
    res.status(400).json({ erro: erro.message || "Não foi possível calcular a entrega." });
  }
});

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function expandirAbreviacoesEndereco(texto) {
  const abreviacoes = {
    r: "Rua",
    rua: "Rua",
    av: "Avenida",
    ave: "Avenida",
    avenida: "Avenida",
    dr: "Doutor",
    doutor: "Doutor",
    dra: "Doutora",
    doutora: "Doutora",
    tv: "Travessa",
    trav: "Travessa",
    travessa: "Travessa",
    rod: "Rodovia",
    rodovia: "Rodovia",
    est: "Estrada",
    estr: "Estrada",
    estrada: "Estrada",
    pc: "Praça",
    pca: "Praça",
    praca: "Praça",
    jd: "Jardim",
    jardim: "Jardim",
    prof: "Professor",
    profa: "Professora",
    cel: "Coronel",
    gov: "Governador",
    pres: "Presidente",
    dep: "Deputado"
  };
  return String(texto || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(parte => {
      const chave = normalizar(parte).replace(/[^a-z0-9]/g, "");
      return abreviacoes[chave] || parte;
    })
    .join(" ");
}

function bairroOficial(nome) {
  const bairros = {
    alagoas: "Alagoas",
    alecrim: "Alecrim",
    bomfim: "Bomfim",
    bonfim: "Bomfim",
    botequim: "Botequim",
    candeal: "Candeal",
    centro: "Centro",
    estancinha: "Estancinha",
    "porto d areia": "Porto D'Areia",
    "porto da areia": "Porto D'Areia",
    "porto dareia": "Porto D'Areia",
    "santa cruz": "Santa Cruz",
    "sao jorge": "São Jorge",
    "valter cardoso costa": "Valter Cardoso Costa",
    "valter cardozo costa": "Valter Cardoso Costa",
    "walter cardoso costa": "Valter Cardoso Costa",
    "walter cardozo costa": "Valter Cardoso Costa",
    "cidade nova": "Valter Cardoso Costa"
  };

  return bairros[normalizar(nome)] || null;
}

app.post("/api/pedido/:pedidoId/endereco", async (req, res) => {
  const pedido = buscarPedido(req.params.pedidoId);

  if (!pedido) {
    return res.status(404).json({ erro: "Pedido não encontrado." });
  }

  if (!validarAcessoPedido(req, res, pedido)) return;

  const endereco = req.body || {};
  const modalidades = new Set(["entrega", "retirada", "salao"]);
  const modalidade = modalidades.has(endereco.modalidade)
    ? endereco.modalidade
    : "entrega";
  const obrigatorios = ["nome", "contato"];

  if (modalidade === "entrega") {
    obrigatorios.push("rua", "bairro", "cidade", "estado", "cep", "complemento");
  }

  const faltando = obrigatorios.find(campo => !String(endereco[campo] || "").trim());

  if (faltando) {
    return res.status(400).json({
      erro: modalidade === "entrega"
        ? "Informe nome, telefone, estado, cidade, rua, bairro, CEP e o tipo de residência."
        : "Informe o nome e o telefone."
    });
  }

  const telefone = String(endereco.contato || "").replace(/\D/g, "");

  if (!/^[1-9]{2}9\d{8}$/.test(telefone)) {
    return res.status(400).json({
      erro: "Informe um celular válido com DDD e 11 números."
    });
  }

  const bairro = modalidade === "entrega"
    ? (bairroOficial(endereco.bairro) || String(endereco.bairro || "").trim())
    : "";
  const cidade = modalidade === "entrega" ? String(endereco.cidade || "").trim() : "";
  const estado = modalidade === "entrega" ? String(endereco.estado || "").trim().toUpperCase() : "";
  const cep = modalidade === "entrega"
    ? String(endereco.cep || "").replace(/\D/g, "")
    : "";
  const tipoResidencia = normalizar(endereco.complemento);

  if (
    modalidade === "entrega" &&
    !new Set(["casa", "apartamento"]).has(tipoResidencia)
  ) {
    return res.status(400).json({
      erro: "Selecione se a residência é casa ou apartamento."
    });
  }

  if (modalidade === "entrega" && !bairro) {
    return res.status(400).json({ erro: "Informe o bairro da entrega." });
  }

  const configEntrega = configuracaoEntrega();
  if (
    modalidade === "entrega" &&
    (normalizar(cidade) !== normalizar(configEntrega.cidadeAtendida) || estado !== configEntrega.estadoAtendido)
  ) {
    return res.status(400).json({
      erro: `Atendemos somente ${configEntrega.cidadeAtendida} - ${configEntrega.estadoAtendido}.`
    });
  }

  if (modalidade === "entrega" && !/^\d{8}$/.test(cep)) {
    return res.status(400).json({
      erro: "Informe um CEP com exatamente 8 números."
    });
  }

  const horariosAgendados = new Set([
    "18:00", "18:30",
    "19:00", "19:30",
    "20:00", "20:30",
    "21:00", "21:30",
    "22:00", "22:30",
    "23:00"
  ]);
  const horario = String(endereco.horario || "");

  if (
    modalidade === "salao" &&
    !horariosAgendados.has(horario)
  ) {
    return res.status(400).json({
      erro: "Escolha um horário entre 18:00 e 23:00."
    });
  }

  if (
    modalidade === "retirada" &&
    horario !== "assim_que_possivel" &&
    !horariosAgendados.has(horario)
  ) {
    return res.status(400).json({
      erro: "Escolha um horário válido para retirada."
    });
  }

  let calculoEntrega = { modoTaxa: null, distanciaKm: null, taxaEntrega: 0 };
  let latitudeEntrega = Number(endereco.latitude);
  let longitudeEntrega = Number(endereco.longitude);

  if (modalidade === "entrega") {
    try {
      let localizado;
      if (Number.isFinite(latitudeEntrega) && Number.isFinite(longitudeEntrega)) {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("lat", String(latitudeEntrega));
        url.searchParams.set("lon", String(longitudeEntrega));
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        localizado = enderecoDoNominatim(await consultarNominatim(url));
      } else {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", `${endereco.rua}, ${endereco.numero || ""}, ${bairro}, ${cidade}, ${estado}, Brasil`);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("countrycodes", "br");
        url.searchParams.set("limit", "1");
        const encontrados = await consultarNominatim(url);
        if (!encontrados.length) throw new Error("Endereço não encontrado no mapa. Selecione uma sugestão ou use sua localização.");
        localizado = enderecoDoNominatim(encontrados[0]);
        latitudeEntrega = localizado.latitude;
        longitudeEntrega = localizado.longitude;
      }
      if (!enderecoNaArea(localizado, configEntrega)) {
        throw new Error(`O endereço está fora de ${configEntrega.cidadeAtendida} - ${configEntrega.estadoAtendido}.`);
      }
      calculoEntrega = await calcularTaxaEntrega(latitudeEntrega, longitudeEntrega);
    } catch (erro) {
      return res.status(400).json({ erro: erro.message || "Não foi possível validar a entrega." });
    }
  }

  const enderecos = lerJson(enderecosPath, {});
  const totais = calcularTotais(pedido, modalidade, calculoEntrega.taxaEntrega);
  enderecos[pedido.id] = {
    cliente: pedido.cliente,
    nome: String(endereco.nome).trim(),
    contato: `+55${telefone}`,
    modalidade,
    rua: modalidade === "entrega"
      ? String(endereco.rua || "Não informado").trim()
      : "Não se aplica",
    numero: modalidade === "entrega"
      ? String(endereco.numero || "Não informado").trim()
      : "Não se aplica",
    bairro: modalidade === "entrega" ? bairro : "Não se aplica",
    complemento: modalidade === "entrega"
      ? (tipoResidencia === "casa" ? "Casa" : "Apartamento")
      : "Não se aplica",
    referencia: String(endereco.referencia || "Sem referência").trim(),
    cidade: "Estância",
    estado: "SE",
    cep: modalidade === "entrega" ? formatarCep(cep) : "Não se aplica",
    valorPedido: totais.valorPedido,
    taxaEntrega: totais.taxaEntrega,
    modoTaxaEntrega: calculoEntrega.modoTaxa,
    distanciaEntregaKm: calculoEntrega.distanciaKm,
    totalFinal: totais.totalFinal,
    horario: modalidade === "entrega" ? null : horario,
    quantidadePessoas: modalidade === "salao"
      ? Math.max(1, Number(endereco.quantidadePessoas || 1))
      : null,
    latitude: Number.isFinite(latitudeEntrega) ? latitudeEntrega : null,
    longitude: Number.isFinite(longitudeEntrega) ? longitudeEntrega : null,
    criadoEm: new Date().toISOString()
  };
  fs.writeFileSync(enderecosPath, JSON.stringify(enderecos, null, 2), "utf8");

  // Mantém o telefone real junto ao pedido para as notificações do painel.
  const pedidos = lerJson(pedidosPath, []);
  const pedidoPersistido = pedidos.find(item => String(item.id) === String(pedido.id));
  if (pedidoPersistido) {
    pedidoPersistido.nomeCliente = enderecos[pedido.id].nome;
    pedidoPersistido.contato = enderecos[pedido.id].contato;
    pedidoPersistido.recebimento = { ...enderecos[pedido.id] };
    fs.writeFileSync(pedidosPath, JSON.stringify(pedidos, null, 2), "utf8");
  }

  try {
    const resposta = await fetch(
      process.env.BOT_CUSTOMER_WEBHOOK_URL ||
        `http://127.0.0.1:${process.env.PORT || 3000}/webhook/cliente`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: pedido.id })
      }
    );
    if (!resposta.ok) {
      console.warn(`Bot não salvou contato de marketing: HTTP ${resposta.status}`);
    }
  } catch (err) {
    console.warn("Não foi possível salvar contato de marketing agora:", err.message);
  }

  res.json({ salvo: true, ...totais });
});

app.post("/api/pedido/:pedidoId/pagamento-local", async (req, res) => {
  const pedido = buscarPedido(req.params.pedidoId);

  if (!pedido) {
    return res.status(404).json({ erro: "Pedido não encontrado." });
  }

  if (!validarAcessoPedido(req, res, pedido, { permitirPagamentoLocalConfirmado: true })) return;

  const enderecos = lerJson(enderecosPath, {});
  const endereco = enderecos[pedido.id];

  if (!endereco) {
    return res.status(400).json({
      erro: "Preencha os dados de recebimento antes de confirmar."
    });
  }
  const totais = calcularTotais(pedido, endereco.modalidade, endereco.taxaEntrega);

  const tipo = req.body.tipo;
  if (!["dinheiro", "maquininha"].includes(tipo)) {
    return res.status(400).json({ erro: "Forma de pagamento inválida." });
  }

  const trocoPara = req.body.trocoPara == null
    ? null
      : Number(req.body.trocoPara);
  // No pagamento presencial basta informar que será no cartão.
  const tipoCartao = null;
  const parcelas = 1;

  if (
    tipo === "dinheiro" &&
    trocoPara !== null &&
    (!Number.isFinite(trocoPara) || trocoPara <= totais.totalFinal)
  ) {
    return res.status(400).json({
      erro: "O valor para troco deve ser maior que o total do pedido."
    });
  }

  endereco.pagamento = tipo;
  endereco.tipoCartao = tipoCartao;
  endereco.parcelas = parcelas;
  endereco.trocoPara = trocoPara;
  endereco.troco =
    tipo === "dinheiro" && trocoPara !== null
      ? Number((trocoPara - totais.totalFinal).toFixed(2))
      : null;
  endereco.valorPedido = totais.valorPedido;
  endereco.taxaEntrega = totais.taxaEntrega;
  endereco.totalFinal = totais.totalFinal;
  endereco.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(enderecosPath, JSON.stringify(enderecos, null, 2), "utf8");

  try {
    const resposta = await fetch(
      process.env.BOT_OFFLINE_WEBHOOK_URL ||
        "http://127.0.0.1:" + (process.env.PORT || 3000) + "/webhook/pedido-offline",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: pedido.id })
      }
    );

    if (!resposta.ok) {
      throw new Error(`Bot respondeu com status ${resposta.status}.`);
    }
  } catch (err) {
    console.error("Erro ao avisar pedido com pagamento local:", err.message);
    return res.status(502).json({
      erro: "Dados salvos, mas não foi possível avisar a pizzaria. Tente confirmar novamente."
    });
  }

  const local = endereco.modalidade === "entrega"
    ? "na entrega"
    : "no estabelecimento";

  res.json({
    confirmado: true,
    mensagem: tipo === "dinheiro"
      ? `Pagamento em dinheiro ${local}.`
      : `Pagamento com cartão ${local}.`
  });
});

app.post("/api/pagamento/:pedidoId", async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ erro: "O pagamento online não está configurado: falta MP_ACCESS_TOKEN no Render." });
    }
    const pedido = buscarPedido(req.params.pedidoId);

    if (!pedido) {
      return res.status(404).json({ erro: "Pedido não encontrado." });
    }

    if (!validarAcessoPedido(req, res, pedido)) return;

    const enderecos = lerJson(enderecosPath, {});
    if (!enderecos[pedido.id]) {
      return res.status(400).json({ erro: "Cadastre o endereço antes de pagar." });
    }
    const endereco = enderecos[pedido.id];
    const totais = calcularTotais(pedido, endereco.modalidade, endereco.taxaEntrega);

    const tipo = req.body.tipo;
    // O Mercado Pago aceita pagamentos a partir de R$ 0,50. Evita uma
    // mensagem técnica quando o pedido tem preço cadastrado muito baixo.
    if (totais.totalFinal < 0.5) {
      return res.status(400).json({
        erro: "O pagamento online exige total mínimo de R$ 0,50. Ajuste o preço do pedido e tente novamente."
      });
    }
    const payment = new Payment(mpClient);

    if (tipo === "pix") {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const pagamento = await payment.create({
        body: {
          transaction_amount: totais.totalFinal,
          description: `Pedido ${pedido.id}`,
          payment_method_id: "pix",
          external_reference: pedido.id,
          notification_url: webhookUrlMercadoPago,
          date_of_expiration: expiresAt,
          payer: { email: emailComprador(pedido.id) }
        },
        requestOptions: { idempotencyKey: `pix-${pedido.id}` }
      });
      const dadosPix = pagamento.point_of_interaction?.transaction_data || {};

      endereco.pagamento = "pix";
      endereco.formaPagamento = "pix";
      endereco.pagamentoId = pagamento.id;
      endereco.pagamentoStatus = pagamento.status;
      endereco.pagamentoAtualizadoEm = new Date().toISOString();
      fs.writeFileSync(enderecosPath, JSON.stringify(enderecos, null, 2), "utf8");

      return res.json({
        tipo: "pix",
        pagamentoId: pagamento.id,
        status: pagamento.status,
        qrCodeBase64: dadosPix.qr_code_base64,
        copiaCola: dadosPix.qr_code,
        ticketUrl: dadosPix.ticket_url,
        expiresAt,
        expiresAtMs: new Date(expiresAt).getTime()
      });
    }

    if (tipo === "cartao") {
      const pagamento = await payment.create({
        body: {
          transaction_amount: totais.totalFinal,
          token: req.body.token,
          description: `Pedido ${pedido.id}`,
          installments: Number(req.body.installments || 1),
          payment_method_id: req.body.payment_method_id,
          issuer_id: req.body.issuer_id,
          external_reference: pedido.id,
          notification_url: webhookUrlMercadoPago,
          payer: {
            email: req.body.payer?.email || emailComprador(pedido.id),
            identification: req.body.payer?.identification
          }
        },
        requestOptions: {
          idempotencyKey: `cartao-${pedido.id}-${Date.now()}`
        }
      });

      endereco.pagamento = "cartao";
      endereco.formaPagamento = pagamento.payment_method_id || req.body.payment_method_id || "cartao";
      endereco.tipoPagamento = pagamento.payment_type_id || null;
      endereco.parcelas = Number(pagamento.installments || req.body.installments || 1);
      endereco.pagamentoId = pagamento.id;
      endereco.pagamentoStatus = pagamento.status;
      endereco.pagamentoAtualizadoEm = new Date().toISOString();
      fs.writeFileSync(enderecosPath, JSON.stringify(enderecos, null, 2), "utf8");

      return res.json({
        tipo: "cartao",
        pagamentoId: pagamento.id,
        status: pagamento.status,
        statusDetail: pagamento.status_detail
      });
    }

    res.status(400).json({ erro: "Tipo de pagamento inválido." });
  } catch (err) {
    const statusMercadoPago = Number(err?.status || err?.statusCode || err?.cause?.status);
    const causas = Array.isArray(err?.cause) ? err.cause : [err?.cause];
    const detalhe = causas
      .map(causa => causa?.description || causa?.message || causa?.code)
      .filter(Boolean)
      .join(" · ") || err?.message || "erro desconhecido";
    console.error("Erro ao gerar pagamento no Mercado Pago:", {
      status: statusMercadoPago || null,
      mensagem: detalhe,
      causa: err?.cause || null
    });
    if ([401, 403].includes(statusMercadoPago)) {
      return res.status(502).json({ erro: "O Mercado Pago recusou a credencial. Confira MP_ACCESS_TOKEN no Render." });
    }
    res.status(502).json({ erro: "Mercado Pago recusou o pagamento: " + detalhe });
  }
});

app.post("/webhook/pagamento", async (req, res) => {
  try {
    const destino =
      process.env.BOT_PAYMENT_WEBHOOK_URL ||
      "http://127.0.0.1:" + (process.env.PORT || 3000) + "/webhook/pagamento";
    const resposta = await fetch(destino, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });

    if (!resposta.ok) {
      throw new Error(`Bot respondeu com status ${resposta.status}.`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro ao encaminhar webhook de pagamento:", err.message);
    res.sendStatus(502);
  }
});

if (require.main === module) {
  app.listen(process.env.PORT || 4000, () => {
    console.log(`SitePag rodando na porta ${process.env.PORT || 4000}`);
  });
}

module.exports = app;
