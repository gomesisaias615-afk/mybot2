const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { garantirArquivo } = require("../services/dadosPersistentes.service");
const precos = require("../services/precos.service");
const { montarCardapio } = require("./cardapio.server");
const imagensProdutos = require("../services/imagemProduto.service");
const { atualizarProdutos, recarregarEstoque, definirQuantidadeProduto } = require("../services/estoque.service");
const { obterClienteWhatsApp } = require("../services/whatsappRuntime.service");
const { buscarContatoCliente } = require("../services/marketing.service");
const {
  obterConfiguracaoPainel,
  atualizarConfiguracaoPainel,
  obterDadosPainel
} = require("../services/painel.service");

const router = express.Router();
const publicDir = path.join(__dirname, "admin-public");
const appPublicDir = path.join(__dirname, "app-public");
const installPublicDir = path.join(__dirname, "install-public");
// Os painéis exigem nova senha após uma hora. O acesso geral do MyBot fica
// persistente por dispositivo; o Chrome limita cookies persistentes a 400 dias.
// Alterar MYBOT_APP_ACCESS_TOKEN invalida imediatamente todas essas sessões.
const DURACAO_SESSAO = 60 * 60 * 1000;
const DURACAO_SESSAO_APP = 400 * 24 * 60 * 60 * 1000;
const COOKIE_PAINEL_LEGADO = "mybot_painel_seguro";
const COOKIE_APP = "mybot_app_acesso";
const PERFIS_PAINEL = {
  administrador: { cookie: "mybot_painel_administrador", token: () => String(process.env.PANEL_ADMIN_TOKEN || "").trim() },
  atendente: { cookie: "mybot_painel_atendente", token: () => String(process.env.PANEL_ATENDENTE_TOKEN || "").trim() }
};
const cacheLocalizacaoReversa = new Map();
const LIMITE_CACHE_LOCALIZACAO = 300;
const ARQUIVO_FICHAS_PUBLICAS = garantirArquivo("fichasEntregaCompartilhadas.json", "data/fichasEntregaCompartilhadas.json", {});
const ARQUIVO_ADICIONAIS = garantirArquivo("adicionais.json", "data/adicionais.json", {});
const ARQUIVO_DESCRICOES_BEBIDAS = garantirArquivo("descricoesbebidas.json", "data/descricoesbebidas.json", {});
const DURACAO_FICHA_PUBLICA = 7 * 24 * 60 * 60 * 1000;

function escaparSvg(valor) {
  return String(valor ?? "").replace(/[&<>\"']/g, caractere => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"
  }[caractere]));
}

function linhasSvg(linhas, largura = 860) {
  const resultado = [];
  for (const original of linhas) {
    const palavras = String(original || "").split(/\s+/).filter(Boolean);
    if (!palavras.length) { resultado.push(""); continue; }
    let atual = "";
    for (const palavra of palavras) {
      const candidata = atual ? `${atual} ${palavra}` : palavra;
      if (candidata.length > 52 && atual) { resultado.push(atual); atual = palavra; }
      else atual = candidata;
    }
    if (atual) resultado.push(atual);
  }
  return resultado;
}

function svgFichaPublica(ficha) {
  const linhas = linhasSvg(ficha.linhas || []);
  const altura = Math.max(620, 235 + linhas.length * 43 + 80);
  let y = 235;
  const corpo = linhas.map(linha => {
    if (!linha) { y += 18; return ""; }
    const destaque = /^(ITENS DO PEDIDO|STATUS DO PAGAMENTO|FORMA DE PAGAMENTO|PAGAMENTO|PARCELAS|CLIENTE|CONTATO|ENDEREÇO|COMPLEMENTO|REFERÊNCIA|CIDADE\/CEP|OBSERVAÇÃO|TOTAL)(:|$)/.test(linha);
    const trecho = `<text x="55" y="${y}" fill="${destaque ? "#117546" : "#17211d"}" font-size="25" font-weight="${destaque ? "700" : "600"}" font-family="Arial, sans-serif">${escaparSvg(linha)}</text>`;
    y += 43;
    return trecho;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="980" height="${altura}" viewBox="0 0 980 ${altura}"><rect width="980" height="${altura}" fill="#f3f6f4"/><rect width="980" height="180" fill="#12251d"/><text x="55" y="68" fill="#fff" font-size="32" font-weight="700" font-family="Arial, sans-serif">PEDIDO PARA ENTREGA</text><text x="55" y="135" fill="#fff" font-size="58" font-weight="700" font-family="Arial, sans-serif">#${escaparSvg(ficha.id)}</text>${corpo}</svg>`;
}

function tokenAdministrador() {
  return PERFIS_PAINEL.administrador.token();
}

function tokenDoApp() {
  return String(process.env.MYBOT_APP_ACCESS_TOKEN || "").trim();
}

function tokenDoPerfil(perfil) {
  return PERFIS_PAINEL[perfil]?.token() || "";
}

function hash(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex");
}

function compararSeguro(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(item => {
    const indice = item.indexOf("=");
    if (indice < 0) return ["", ""];
    return [item.slice(0, indice).trim(), decodeURIComponent(item.slice(indice + 1))];
  }).filter(([chave]) => chave));
}

function criarSessao(res, perfil = "administrador") {
  // A sessão não pode depender da memória do processo: no Render uma próxima
  // chamada pode chegar a outra instância. O cookie é assinado pelo token do
  // painel e continua válido por 24 horas em qualquer instância.
  const emitidoEm = String(Date.now());
  const aleatorio = crypto.randomBytes(24).toString("base64url");
  const conteudo = `${emitidoEm}.${aleatorio}`;
  const assinatura = crypto.createHmac("sha256", tokenDoPerfil(perfil)).update(conteudo).digest("base64url");
  const id = `${conteudo}.${assinatura}`;
  res.clearCookie("mybot_painel", { path: "/" });
  // Remove a versão anterior do mesmo cookie. Sem isso, alguns navegadores
  // enviam os dois valores para /api/painel e o servidor pode ler o vencido.
  res.clearCookie(COOKIE_PAINEL_LEGADO, { path: "/api/painel" });
  res.cookie(PERFIS_PAINEL[perfil].cookie, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: DURACAO_SESSAO,
    path: "/"
  });
}

function sessaoAssinadaValida(id, segredo, duracao) {
  if (!id || !segredo) return false;
  const partes = String(id).split(".");
  if (partes.length !== 3) return false;
  const [emitidoEm, aleatorio, assinatura] = partes;
  const instante = Number(emitidoEm);
  if (!Number.isFinite(instante) || instante > Date.now() || Date.now() - instante > duracao) return false;
  const esperada = crypto.createHmac("sha256", segredo).update(`${emitidoEm}.${aleatorio}`).digest("base64url");
  return compararSeguro(assinatura, esperada);
}

function criarSessaoApp(res) {
  const segredo = tokenDoApp();
  const emitidoEm = String(Date.now());
  const aleatorio = crypto.randomBytes(24).toString("base64url");
  const conteudo = `${emitidoEm}.${aleatorio}`;
  const assinatura = crypto.createHmac("sha256", segredo).update(conteudo).digest("base64url");
  res.cookie(COOKIE_APP, `${conteudo}.${assinatura}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: DURACAO_SESSAO_APP,
    path: "/"
  });
}

function appAutenticado(req) {
  return sessaoAssinadaValida(cookies(req)[COOKIE_APP], tokenDoApp(), DURACAO_SESSAO_APP);
}

function perfilAutenticado(req, perfilPreferido = "") {
  const recebidos = cookies(req);
  const perfis = Object.entries(PERFIS_PAINEL).sort(([a], [b]) => (b === perfilPreferido) - (a === perfilPreferido));
  for (const [perfil, dados] of perfis) {
    const id = recebidos[dados.cookie] || (perfil === "administrador" ? recebidos[COOKIE_PAINEL_LEGADO] : "");
    if (!id || !dados.token()) continue;
    const partes = String(id).split(".");
    if (partes.length !== 3) continue;
    const [emitidoEm, aleatorio, assinatura] = partes;
    const instante = Number(emitidoEm);
    if (!Number.isFinite(instante) || instante > Date.now() || Date.now() - instante > DURACAO_SESSAO) continue;
    const esperada = crypto.createHmac("sha256", dados.token()).update(`${emitidoEm}.${aleatorio}`).digest("base64url");
    if (compararSeguro(assinatura, esperada)) return perfil;
  }
  return null;
}

function autenticado(req) {
  return Boolean(perfilAutenticado(req));
}

function limparSessoes(res) {
  res.clearCookie(COOKIE_PAINEL_LEGADO, { path: "/" });
  res.clearCookie(COOKIE_PAINEL_LEGADO, { path: "/api/painel" });
  for (const dados of Object.values(PERFIS_PAINEL)) res.clearCookie(dados.cookie, { path: "/" });
  res.clearCookie(COOKIE_APP, { path: "/" });
}

router.get(["/app", "/app/"], (req, res) => {
  res.set("Cache-Control", "no-store").sendFile(path.join(appPublicDir, "index.html"));
});
router.get("/instalar", (req, res) => res.set("Cache-Control", "no-store").type("html").send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#08783f"><link rel="manifest" href="/app/manifest.webmanifest"><title>Instalar MyBot</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08783f;font-family:Arial;color:#fff}main{max-width:420px;margin:20px;padding:32px;text-align:center;border-radius:28px;background:#063c25}.logo{width:160px}.lista{text-align:left;line-height:2;background:#0c5939;padding:18px;border-radius:16px}.botao{width:100%;padding:18px;border:0;border-radius:14px;background:#25cf72;color:#042716;font-weight:bold;font-size:16px;cursor:pointer}.ajuda{font-size:13px;line-height:1.5;color:#d5eddf}</style><main><img class="logo" src="/painel/mybot-logo-verde.png" alt="MyBot"><h1>Instale o MyBot</h1><p>Tenha o MyBot na tela inicial do celular ou computador.</p><div class="lista">✓ Ícone MyBot<br>✓ Acesso por token e HTTPS<br>✓ Administrador e Atendente</div><br><button class="botao" id="instalar">⬇ INSTALAR MYBOT</button><p class="ajuda">Se o Chrome não abrir a instalação, use o menu ⋮ e escolha Instalar app.</p></main><script>let p;addEventListener('beforeinstallprompt',e=>{e.preventDefault();p=e});document.querySelector('#instalar').onclick=async()=>{if(!p)return alert('No Chrome, use ⋮ → Instalar app');p.prompt();await p.userChoice;p=null}</script>`));
router.use("/app", express.static(appPublicDir, { etag: false, lastModified: false }));
router.get(["/instalar", "/instalar/"], (req, res) => {
  res.set("Cache-Control", "no-store").sendFile(path.join(installPublicDir, "index.html"));
});
router.use("/instalar", express.static(installPublicDir, { etag: false, lastModified: false }));
router.get("/api/app/sessao", (req, res) => {
  res.set("Cache-Control", "no-store").json({ autenticado: appAutenticado(req), configurado: Boolean(tokenDoApp()) });
});
router.post("/api/app/entrar", (req, res) => {
  const esperado = tokenDoApp();
  if (!esperado || !compararSeguro(req.body?.token || "", esperado)) return res.status(401).json({ erro: "Código de acesso incorreto." });
  criarSessaoApp(res);
  res.json({ autenticado: true });
});
router.post("/api/app/sair", (req, res) => {
  res.clearCookie(COOKIE_APP, { path: "/" });
  res.sendStatus(204);
});

function autenticarPerfil(req, res, next) {
  const perfil = perfilAutenticado(req, String(req.get("x-mybot-portal") || ""));
  if (!perfil) return res.status(401).json({ erro: "Acesso expirado ou não autorizado." });
  req.perfilPainel = perfil;
  next();
}

function exigirAutenticacao(req, res, next) {
  if (!autenticado(req)) return res.status(401).json({ erro: "Acesso expirado ou não autorizado." });
  res.set("Cache-Control", "no-store");
  next();
}

router.get("/painel/acesso/:perfil/:token", (req, res) => {
  const perfil = req.params.perfil === "atendente" ? "atendente" : "administrador";
  const esperado = tokenDoPerfil(perfil);
  if (!esperado || !compararSeguro(req.params.token, esperado)) {
    return res.status(404).send("Acesso não encontrado.");
  }
  criarSessao(res, perfil);
  res.redirect(302, `/painel/${perfil === "administrador" ? "adm" : "atendente"}`);
});

router.get("/painel/acesso/:token", (req, res) => {
  const esperado = tokenAdministrador();
  if (!esperado || !compararSeguro(req.params.token, esperado)) return res.status(404).send("Acesso não encontrado.");
  criarSessao(res, "administrador");
  res.redirect(302, "/painel/adm");
});

function urlPublica(req) {
  // Para a prévia, use o domínio da requisição atual. Assim uma PUBLIC_URL
  // antiga no Render não aponta a imagem para outro serviço.
  const protocolo = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  return `${protocolo || "https"}://${host}`;
}

function painelComPrevia(req, res, perfil = "administrador") {
  const arquivo = path.join(publicDir, "index.html");
  const url = urlPublica(req);
  const previa = `\n  <meta property="og:type" content="website">\n  <meta property="og:title" content="MyBot | Painel administrativo">\n  <meta property="og:description" content="Acesse o painel administrativo do MyBot.">\n  <meta property="og:url" content="${url}/painel/">\n  <meta property="og:image" content="${url}/painel/mybot-logo-verde.png">\n  <meta property="og:image:type" content="image/png">\n  <meta property="og:image:alt" content="MyBot">\n  <meta name="twitter:card" content="summary_large_image">`;
  try {
    const inicializacao = `<script>window.MYBOT_PORTAL=${JSON.stringify(perfil)};</script>`;
    const html = fs.readFileSync(arquivo, "utf8").replace("</head>", `${previa}\n${inicializacao}\n</head>`);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate").type("html").send(html);
  } catch {
    res.sendFile(arquivo);
  }
}

router.get(["/painel/", "/painel/index.html", "/painel/adm"], (req, res) => painelComPrevia(req, res, "administrador"));
router.get("/painel/atendente", (req, res) => painelComPrevia(req, res, "atendente"));

router.use("/painel", express.static(publicDir, {
  index: "index.html",
  fallthrough: false,
  etag: false,
  lastModified: false,
  setHeaders: res => res.set("Cache-Control", "no-store, no-cache, must-revalidate")
}));

router.get("/api/painel/sessao", (req, res) => {
  const perfil = perfilAutenticado(req, String(req.get("x-mybot-portal") || ""));
  res.json({ autenticado: Boolean(perfil), perfil, configurado: Boolean(tokenAdministrador()), atendenteConfigurado: Boolean(tokenDoPerfil("atendente")) });
});

router.post("/api/painel/entrar", (req, res) => {
  const perfil = req.body?.perfil === "atendente" ? "atendente" : "administrador";
  const esperado = tokenDoPerfil(perfil);
  if (!esperado || !compararSeguro(req.body?.token || "", esperado)) {
    return res.status(401).json({ erro: "Código de acesso incorreto." });
  }
  criarSessao(res, perfil);
  res.json({ autenticado: true, perfil });
});

router.post("/api/painel/sair", exigirAutenticacao, (req, res) => {
  limparSessoes(res);
  res.sendStatus(204);
});

router.use("/api/painel", autenticarPerfil, (req, res, next) => {
  const rotaAtendimento = req.path === "/dados" || req.path.startsWith("/pedidos/") || req.path === "/ficha-entrega";
  if (req.perfilPainel === "atendente" && !rotaAtendimento) return res.status(403).json({ erro: "Esta área é exclusiva do portal administrativo." });
  if (req.perfilPainel === "administrador" && req.path.startsWith("/pedidos/")) return res.status(403).json({ erro: "Pedidos são atendidos somente no portal do atendente." });
  next();
});

// Cria um link temporário, compartilhável apenas por quem o recebeu, para a
// imagem da ficha. Isso permite encaminhar a ficha no WhatsApp Web sem anexar
// arquivos manualmente.
router.post("/api/painel/ficha-entrega", exigirAutenticacao, (req, res) => {
  const id = String(req.body?.id || "").trim();
  const linhasRecebidas = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
  const linhas = linhasRecebidas.map(linha => String(linha || "").trim()).filter((linha, indice) => linha || indice > 0).slice(0, 100);
  if (!id || !linhas.length || linhas.some(linha => linha.length > 500)) {
    return res.status(400).json({ erro: "Ficha de entrega inválida." });
  }
  const agora = Date.now();
  const fichas = JSON.parse(fs.readFileSync(ARQUIVO_FICHAS_PUBLICAS, "utf8") || "{}");
  for (const [token, ficha] of Object.entries(fichas)) {
    if (!ficha?.expiraEm || ficha.expiraEm < agora) delete fichas[token];
  }
  const token = crypto.randomBytes(24).toString("base64url");
  fichas[token] = { id, linhas, expiraEm: agora + DURACAO_FICHA_PUBLICA };
  fs.writeFileSync(ARQUIVO_FICHAS_PUBLICAS, JSON.stringify(fichas, null, 2));
  const base = `${req.protocol}://${req.get("host")}`;
  res.json({ url: `${base}/ficha-entrega/${token}.svg`, expiraEm: fichas[token].expiraEm });
});

router.get("/ficha-entrega/:token.svg", (req, res) => {
  try {
    const fichas = JSON.parse(fs.readFileSync(ARQUIVO_FICHAS_PUBLICAS, "utf8") || "{}");
    const ficha = fichas[req.params.token];
    if (!ficha || !ficha.expiraEm || ficha.expiraEm < Date.now()) return res.status(410).type("text").send("Esta ficha expirou.");
    const baixar = String(req.query.download || "") === "1";
    if (baixar) res.attachment(`pedido-${ficha.id}.svg`);
    res.set("Cache-Control", "private, max-age=300").type("image/svg+xml").send(svgFichaPublica(ficha));
  } catch {
    res.status(404).type("text").send("Ficha não encontrada.");
  }
});

router.get("/api/painel/localizacao/reversa", exigirAutenticacao, async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return res.status(400).json({ erro: "Coordenadas inválidas." });
  }

  const chaveCache = latitude.toFixed(5) + "," + longitude.toFixed(5);
  const armazenado = cacheLocalizacaoReversa.get(chaveCache);
  if (armazenado?.enderecoEncontrado) return res.json(armazenado);

  const contato = String(process.env.GEOCODING_CONTACT_EMAIL || "gomesisaias615@gmail.com").trim();
  const agente = "MyBot-Pizzarias/1.0 (https://github.com/gomesisaias615-afk/mybotserver; contato: " + contato + ")";

  const montarTexto = (...valores) => [...new Set(
    valores.flat().map(valor => String(valor || "").trim()).filter(Boolean)
  )].join(", ");

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("accept-language", "pt-BR");
    if (contato.includes("@")) url.searchParams.set("email", contato);

    const resposta = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": agente,
        Referer: process.env.PUBLIC_BASE_URL || "https://mybotserver-m5or.onrender.com/"
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!resposta.ok) throw new Error(`OpenStreetMap respondeu HTTP ${resposta.status}`);

    const dados = await resposta.json();
    const endereco = dados.address || {};
    const logradouro = endereco.road || endereco.pedestrian || endereco.residential ||
      endereco.footway || endereco.path || endereco.cycleway || "";
    const rua = montarTexto(logradouro, endereco.house_number);
    const bairro = endereco.suburb || endereco.neighbourhood || endereco.quarter ||
      endereco.city_district || endereco.hamlet || "";
    const cidade = endereco.city || endereco.town || endereco.municipality ||
      endereco.village || endereco.county || "";
    const estado = endereco.state || "";
    const texto = montarTexto(rua, bairro, cidade, estado, endereco.postcode, endereco.country || "Brasil");

    if (!texto || (!rua && !bairro)) {
      throw new Error("O OpenStreetMap não encontrou rua ou bairro neste ponto.");
    }

    const resultado = {
      texto,
      rua,
      bairro,
      cidade,
      estado,
      cep: endereco.postcode || "",
      latitude,
      longitude,
      enderecoEncontrado: true,
      fonte: "OpenStreetMap",
      atribuicao: "© OpenStreetMap contributors"
    };

    if (cacheLocalizacaoReversa.size >= LIMITE_CACHE_LOCALIZACAO) {
      cacheLocalizacaoReversa.delete(cacheLocalizacaoReversa.keys().next().value);
    }
    cacheLocalizacaoReversa.set(chaveCache, resultado);
    res.set("Cache-Control", "private, max-age=300");
    return res.json(resultado);
  } catch (erroNominatim) {
    console.warn("Consulta reversa principal falhou:", erroNominatim.message);
  }

  try {
    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));

    const resposta = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": agente },
      signal: AbortSignal.timeout(12000)
    });
    if (!resposta.ok) throw new Error(`Photon respondeu HTTP ${resposta.status}`);

    const dados = await resposta.json();
    const endereco = dados.features?.[0]?.properties || {};
    const rua = montarTexto(endereco.street || endereco.name, endereco.housenumber);
    const bairro = montarTexto(endereco.locality, endereco.district, endereco.suburb);
    const cidade = endereco.city || endereco.county || "";
    const estado = endereco.state || "";
    const texto = montarTexto(rua, bairro, cidade, estado, endereco.postcode, endereco.country || "Brasil");

    if (!texto || (!rua && !bairro)) {
      throw new Error("A consulta reserva não encontrou rua ou bairro.");
    }

    const resultado = {
      texto,
      rua,
      bairro,
      cidade,
      estado,
      cep: endereco.postcode || "",
      latitude,
      longitude,
      enderecoEncontrado: true,
      fonte: "Photon/Komoot",
      atribuicao: "© OpenStreetMap contributors"
    };

    if (cacheLocalizacaoReversa.size >= LIMITE_CACHE_LOCALIZACAO) {
      cacheLocalizacaoReversa.delete(cacheLocalizacaoReversa.keys().next().value);
    }
    cacheLocalizacaoReversa.set(chaveCache, resultado);
    res.set("Cache-Control", "private, max-age=300");
    return res.json(resultado);
  } catch (erroReserva) {
    console.warn("Consulta reversa reserva falhou:", erroReserva.message);
    return res.status(503).json({
      erro: "Não foi possível identificar rua e bairro neste ponto. Toque exatamente sobre uma rua ou pesquise o endereço pelo nome.",
      enderecoEncontrado: false
    });
  }
});

router.get("/cardapio/imagem/:tipo/:chave", (req, res) => {
  try {
    const imagem = imagensProdutos.caminhoImagem(req.params.tipo, req.params.chave);
    if (!imagem) return res.sendStatus(404);
    res.type(imagem.mime).set("Cache-Control", "public, max-age=86400").sendFile(imagem.arquivo);
  } catch {
    res.sendStatus(404);
  }
});

router.get("/api/painel/imagens", exigirAutenticacao, (req, res) => {
  const catalogo = precos.catalogo();
  const configuracao = JSON.parse(fs.readFileSync(garantirArquivo("configuracaoCardapio.json", "data/configuracaoCardapio.json", {}), "utf8"));
  const categoriaPorNome = Object.fromEntries(Object.entries(configuracao.pizzasPorCategoria || {}).flatMap(([categoria, nomes]) => (nomes || []).map(nome => [nome, categoria])));
  const tipoProduto = nome => categoriaPorNome[nome] === "especiais" ? "acompanhamentos" : categoriaPorNome[nome] === "doces" ? "combos" : "pizzas";
  const pizzas = Object.keys(catalogo.pizzas || {}).map(chave => { const tipo = tipoProduto(chave); return { tipo, chave, nome: chave, imagem: imagensProdutos.urlImagem(tipo, chave) }; });
  const bebidas = Object.entries(catalogo.nomesBebidas || {}).map(([chave, dados]) => ({ tipo: "bebidas", chave, nome: dados.nome || chave, imagem: imagensProdutos.urlImagem("bebidas", chave) }));
  res.json([...pizzas, ...bebidas]);
});
router.put("/api/painel/imagens/:tipo/:chave", exigirAutenticacao, (req, res) => {
  try {
    const item = imagensProdutos.salvarImagem(req.params.tipo, req.params.chave, req.body?.imagem);
    res.json({ sucesso: true, imagem: imagensProdutos.urlImagem(req.params.tipo, req.params.chave), atualizadoEm: item.atualizadoEm });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});
router.delete("/api/painel/imagens/:tipo/:chave", exigirAutenticacao, (req, res) => {
  try {
    imagensProdutos.removerImagem(req.params.tipo, req.params.chave);
    res.sendStatus(204);
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

router.get("/api/painel/dados", exigirAutenticacao, (req, res) => {
  const dados = obterDadosPainel();
  // O administrador não usa nem recebe dados operacionais de pedidos; essa
  // informação pertence exclusivamente ao portal do atendente.
  if (req.perfilPainel === "administrador") dados.pedidos = [];
  res.json(dados);
});

router.post("/api/painel/catalogo/item", exigirAutenticacao, (req,res)=>{try{
  const tipo=String(req.body?.tipo||""),nome=String(req.body?.nome||"").trim(),ingredientes=String(req.body?.ingredientes||"").trim();
  if(!nome||nome.length>80)throw Error("Informe o nome do item.");
  const ler=p=>JSON.parse(fs.readFileSync(p,"utf8")),salvar=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2));
  if(["pizza","acompanhamento","combo"].includes(tipo)){
    const categoriaDestino=tipo==="pizza"?"tradicionais":tipo==="acompanhamento"?"especiais":"doces";
    if(!ingredientes||ingredientes.length>500)throw Error("Informe a descrição do produto (até 500 caracteres).");
    const valor=Number(req.body?.preco);if(!Number.isFinite(valor)||valor<=0)throw Error("Informe um preço válido.");const tamanhos={U:valor};
    const p=garantirArquivo("precospizzas.json","data/precospizzas.json",{}),c=garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{}),e=garantirArquivo("estoque.json","services/monitoramento/estoque.json",{pizzas:{},bebidas:{}}),pre=ler(p),conf=ler(c),est=ler(e);
    const tipoEstoque=tipo==="pizza"?"pizzas":tipo==="acompanhamento"?"acompanhamentos":"combos";
    if(pre[nome])throw Error("Já existe um item com esse nome.");pre[nome]=tamanhos;conf.pizzasPorCategoria=conf.pizzasPorCategoria||{};conf.pizzasPorCategoria[categoriaDestino]||=[];conf.pizzasPorCategoria[categoriaDestino].push(nome);est[tipoEstoque]=est[tipoEstoque]||{};est[tipoEstoque][nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/-/g," ").replace(/\s+/g," ").trim()]=1;salvar(p,pre);salvar(c,conf);salvar(e,est);precos.atualizarIngredientesPizza(nome,ingredientes)
  }else if(tipo==="bebida"){
    const preco=Number(req.body?.preco);if(!Number.isFinite(preco)||preco<=0)throw Error("Informe um preço válido.");
    const k=nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_"),p=garantirArquivo("precosbebidas.json","data/precosbebidas.json",{}),n=garantirArquivo("nomesbebidas.json","data/nomesbebidas.json",{}),e=garantirArquivo("estoque.json","services/monitoramento/estoque.json",{pizzas:{},bebidas:{}}),pre=ler(p),nom=ler(n),est=ler(e);
    if(pre[k])throw Error("Já existe uma bebida com esse nome.");if(!ingredientes||ingredientes.length>500)throw Error("Informe a descrição da bebida (até 500 caracteres).");const descricoes=ler(ARQUIVO_DESCRICOES_BEBIDAS);pre[k]=preco;nom[k]={nome,aliases:[k.replaceAll("_"," ")]};descricoes[k]=ingredientes;est.bebidas=est.bebidas||{};est.bebidas[k]=1;salvar(p,pre);salvar(n,nom);salvar(ARQUIVO_DESCRICOES_BEBIDAS,descricoes);salvar(e,est)
  }else throw Error("Tipo inválido.");res.json({ok:true})
}catch(e){res.status(400).json({erro:e.message})}});
router.get("/api/painel/precos", exigirAutenticacao, (req,res)=>{
  const catalogo=precos.catalogo();
  const configuracao=JSON.parse(fs.readFileSync(garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{}),"utf8"));
  const categoriasProdutos={};
  for(const [categoria,nomes] of Object.entries(configuracao.pizzasPorCategoria||{})){
    for(const nome of nomes||[])categoriasProdutos[nome]=categoria;
  }
  res.json({...catalogo,categoriasProdutos});
});
router.get("/api/painel/ingredientes", exigirAutenticacao, (req,res)=>{const bebidas=precos.catalogo().nomesBebidas||{},descricoes=JSON.parse(fs.readFileSync(ARQUIVO_DESCRICOES_BEBIDAS,"utf8"));res.json([...montarCardapio().pizzas.map(({nome,ingredientes,categoria})=>({nome,ingredientes,categoria,tipo:"pizza",chave:nome})),...Object.entries(bebidas).map(([chave,dados])=>({nome:dados.nome||chave,ingredientes:descricoes[chave]||"",categoria:"bebidas",tipo:"bebida",chave}))])});
router.patch("/api/painel/ingredientes/pizza", exigirAutenticacao, (req,res)=>{try{res.json({nome:String(req.body?.nome||""),ingredientes:precos.atualizarIngredientesPizza(String(req.body?.nome||""),req.body?.ingredientes)})}catch(e){res.status(400).json({erro:e.message})}});
router.patch("/api/painel/ingredientes/bebida", exigirAutenticacao, (req,res)=>{try{const chave=String(req.body?.chave||""),texto=String(req.body?.ingredientes||"").trim();if(!precos.catalogo().bebidas?.[chave])throw Error("Bebida não encontrada.");if(!texto||texto.length>500)throw Error("Informe a descrição da bebida (até 500 caracteres).");const descricoes=JSON.parse(fs.readFileSync(ARQUIVO_DESCRICOES_BEBIDAS,"utf8"));descricoes[chave]=texto;fs.writeFileSync(ARQUIVO_DESCRICOES_BEBIDAS,JSON.stringify(descricoes,null,2),"utf8");res.json({chave,ingredientes:texto})}catch(e){res.status(400).json({erro:e.message})}});
router.get("/api/painel/adicionais", exigirAutenticacao, (req,res)=>{
  const catalogo=precos.catalogo(),configuracao=JSON.parse(fs.readFileSync(garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{}),"utf8")),salvos=JSON.parse(fs.readFileSync(ARQUIVO_ADICIONAIS,"utf8"));
  const categoriaPorNome=Object.fromEntries(Object.entries(configuracao.pizzasPorCategoria||{}).flatMap(([categoria,nomes])=>(nomes||[]).map(nome=>[nome,categoria])));
  const tipo=nome=>categoriaPorNome[nome]==="especiais"?"acompanhamentos":categoriaPorNome[nome]==="doces"?"combos":"hamburgueres";
  res.json(Object.keys(catalogo.pizzas||{}).filter(nome=>tipo(nome)!=="acompanhamentos").map(nome=>({nome,tipo:tipo(nome),adicionais:Array.isArray(salvos[nome])?salvos[nome]:[]})));
});
router.put("/api/painel/adicionais", exigirAutenticacao, (req,res)=>{try{
  const recebidos=req.body?.adicionais||{},catalogo=precos.catalogo(),configuracao=JSON.parse(fs.readFileSync(garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{}),"utf8"));
  const normalizar=valor=>String(valor||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const categoriaPorNome=Object.fromEntries(Object.entries(configuracao.pizzasPorCategoria||{}).flatMap(([categoria,nomes])=>(nomes||[]).map(nome=>[nome,categoria])));
  const permitidos=Object.keys(catalogo.pizzas||{}).filter(nome=>["tradicionais","doces"].includes(categoriaPorNome[nome]||"tradicionais"));
  const salvar={};
  for(const [produtoRecebido,itens] of Object.entries(recebidos)){
    const produto=permitidos.find(nome=>normalizar(nome)===normalizar(produtoRecebido));
    if(!produto)continue;
    const linhas=Array.isArray(itens)?itens:[];
    const limpos=[];
    for(const item of linhas){
      const nome=String(item?.nome||"").trim();
      const preco=Number(String(item?.preco??"").replace(",","."));
      if(!nome)continue;
      if(nome.length>80||!Number.isFinite(preco)||preco<=0||preco>5000)throw Error(`Informe um valor válido para o adicional "${nome}".`);
      limpos.push({nome,preco});
    }
    if(limpos.length>20)throw Error("Cada produto pode ter no máximo 20 adicionais.");
    if(limpos.length)salvar[produto]=limpos;
  }
  fs.writeFileSync(ARQUIVO_ADICIONAIS,JSON.stringify(salvar,null,2),"utf8");res.json({ok:true,adicionais:salvar});
}catch(e){res.status(400).json({erro:e.message})}});
router.delete("/api/painel/catalogo/item", exigirAutenticacao, (req,res)=>{try{
  const tipo=String(req.body?.tipo||""),chave=String(req.body?.chave||""),normalizar=v=>String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/-/g," ").replace(/\s+/g," ").trim(),ler=p=>JSON.parse(fs.readFileSync(p,"utf8")),salvar=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2));
  const e=garantirArquivo("estoque.json","services/monitoramento/estoque.json",{pizzas:{},bebidas:{}}),est=ler(e);
  if(!["pizzas","acompanhamentos","combos","bebidas"].includes(tipo))throw Error("Tipo inválido.");
  if(tipo==="bebidas"){const p=garantirArquivo("precosbebidas.json","data/precosbebidas.json",{}),n=garantirArquivo("nomesbebidas.json","data/nomesbebidas.json",{}),d=garantirArquivo("descricoesbebidas.json","data/descricoesbebidas.json",{}),pre=ler(p),nom=ler(n),desc=ler(d);if(!(chave in pre))throw Error("Bebida não encontrada.");delete pre[chave];delete nom[chave];delete desc[chave];delete est.bebidas?.[chave];salvar(p,pre);salvar(n,nom);salvar(d,desc)}else{const p=garantirArquivo("precospizzas.json","data/precospizzas.json",{}),c=garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{}),i=garantirArquivo("ingredientespizzas.json",null,{}),pre=ler(p),conf=ler(c),ing=ler(i),nome=Object.keys(pre).find(item=>normalizar(item)===normalizar(chave));if(!nome)throw Error("Produto não encontrado.");delete pre[nome];delete ing[nome];for(const nomes of Object.values(conf.pizzasPorCategoria||{})){const indice=nomes.indexOf(nome);if(indice>=0)nomes.splice(indice,1)}delete est[tipo]?.[normalizar(nome)];const extras=ler(ARQUIVO_ADICIONAIS);delete extras[nome];salvar(p,pre);salvar(c,conf);salvar(i,ing);salvar(ARQUIVO_ADICIONAIS,extras)}
  salvar(e,est);res.json({ok:true});
}catch(e){res.status(400).json({erro:e.message})}});
router.patch("/api/painel/precos/pizza", exigirAutenticacao, (req,res)=>{try{res.json({preco:precos.atualizarPrecoPizza(String(req.body?.nome||""),String(req.body?.tamanho||""),req.body?.preco)})}catch(e){res.status(400).json({erro:e.message})}});
router.patch("/api/painel/precos/bebida", exigirAutenticacao, (req,res)=>{try{res.json({preco:precos.atualizarPrecoBebida(String(req.body?.chave||""),req.body?.preco)})}catch(e){res.status(400).json({erro:e.message})}});
router.put("/api/painel/promocoes", exigirAutenticacao, (req,res)=>{try{const dados=req.body||{};if(String(dados.tipo)==="pizza"){const estoque=recarregarEstoque(),configuracao=JSON.parse(fs.readFileSync(garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{}),"utf8")),categoria=Object.entries(configuracao.pizzasPorCategoria||{}).find(([,nomes])=>(nomes||[]).includes(String(dados.chave||"")))?.[0],tipoEstoque=categoria==="especiais"?"acompanhamentos":categoria==="doces"?"combos":"pizzas",chave=String(dados.chave||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();if(Number(estoque[tipoEstoque]?.[chave]||0)<=0)throw Error("Não é possível aplicar promoção em um produto indisponível.");}res.json(precos.salvarPromocao(dados))}catch(e){res.status(400).json({erro:e.message})}});
router.delete("/api/painel/promocoes", exigirAutenticacao, (req,res)=>{try{res.json(precos.removerPromocao(String(req.body?.tipo||""),String(req.body?.chave||""),String(req.body?.tamanho||"")))}catch(e){res.status(400).json({erro:e.message})}});
router.patch("/api/painel/configuracao", exigirAutenticacao, (req, res) => {
  res.json(atualizarConfiguracaoPainel(req.body || {}));
});

router.patch("/api/painel/estoque", exigirAutenticacao, (req, res) => {
  const tipo = String(req.body?.tipo || "");
  const chave = String(req.body?.chave || "");
  const quantidade = Number(req.body?.quantidade);
  const estoque = recarregarEstoque();
  if (!["pizzas", "bebidas", "acompanhamentos", "combos"].includes(tipo) || !Object.prototype.hasOwnProperty.call(estoque[tipo], chave)) {
    return res.status(404).json({ erro: "Produto não encontrado." });
  }
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 10000) {
    return res.status(400).json({ erro: "Informe uma quantidade entre 0 e 10.000." });
  }
  const atual = Number(estoque[tipo][chave]) || 0;
  if (quantidade === atual) {
    return res.json({ tipo, chave, anterior: atual, atual });
  }

  // Sempre grava no mesmo arquivo persistente usado pelo bot e pelo cardápio.
  const atualizada = definirQuantidadeProduto(tipo, chave, quantidade);
  res.json({ tipo, chave, anterior: atual, atual: atualizada });
});

function mensagemStatusCliente(pedido, status) {
  const id = pedido.id;
  const modalidade = pedido.recebimento?.modalidade || "entrega";
  const mensagens = {
    confirmado: {
      entrega: `✅ *Pedido #${id} confirmado!*\n\nRecebemos seu pedido para entrega e a cozinha já foi avisada. Você receberá uma nova mensagem assim que o preparo começar.`,
      retirada: `✅ *Pedido #${id} confirmado!*\n\nSeu pedido para retirada foi recebido. Avisaremos por aqui quando estiver pronto para você buscar.`,
      salao: `✅ *Pedido #${id} confirmado!*\n\nSeu pedido no salão foi enviado à cozinha. Em breve iniciaremos o preparo.`
    },
    em_preparo: {
      entrega: `🍕 *Pedido #${id} em preparo!*\n\nEstamos preparando seu pedido. Avisaremos assim que estiver pronto para sair para entrega.`,
      retirada: `🍕 *Pedido #${id} em preparo!*\n\nJá estamos preparando seu pedido. Aguarde nosso aviso antes de ir buscá-lo.`,
      salao: `🍕 *Pedido #${id} em preparo!*\n\nA cozinha já começou a preparar seu pedido. Logo ele estará pronto para ser servido.`
    },
    pronto: {
      entrega: `✅ *Pedido #${id} pronto!*\n\nSeu pedido foi finalizado e está aguardando o entregador. Avisaremos quando ele sair para entrega.`,
      retirada: `🥡 *Pedido #${id} pronto para retirada!*\n\nVocê já pode vir buscá-lo. Ao chegar, informe o código *#${id}*.`,
      salao: `🍽️ *Pedido #${id} pronto!*\n\nSeu pedido foi finalizado e está pronto.`
    }
  };
  if (mensagens[status]) return mensagens[status][modalidade] || mensagens[status].entrega;
  return {
    saiu_entrega: `🛵 *Pedido #${id} saiu para entrega!*\n\nSeu pedido está a caminho e chegará em breve.`,
    cancelado: `❌ *Pedido #${id} cancelado.*\n\nA pizzaria não conseguiu prosseguir com o pedido. Se houve pagamento online, entre em contato para receber as orientações.`
  }[status] || null;
}

async function notificarStatusCliente(pedido, status) {
  const texto = mensagemStatusCliente(pedido, status);
  if (!texto) return { enviada: false, motivo: "sem_mensagem" };
  const normalizarContato = valor => {
    const original = String(valor || "").trim();
    if (!original || original.includes("@")) return original;
    const digitos = original.replace(/\D/g, "");
    return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  };
  const contatoSalvo = buscarContatoCliente(pedido.cliente);
  // O telefone confirmado no checkout é mais confiável que um identificador
  // interno @lid. O chat original permanece como último recurso.
  const candidatos = [
    pedido.recebimento?.contato,
    pedido.contato,
    contatoSalvo,
    pedido.cliente
  ];
  const destinos = candidatos.map(normalizarContato)
    .filter((valor, indice, lista) => valor && lista.indexOf(valor) === indice);
  if (!destinos.length) return { enviada: false, motivo: "cliente_sem_contato" };
  let ultimoErro = null;
  for (const destino of destinos) {
    try {
      await obterClienteWhatsApp().sendMessage(destino, texto);
      console.log(`[PAINEL] Cliente avisado sobre pedido ${pedido.id}: ${status} (${destino})`);
      return { enviada: true, destino };
    } catch (erro) {
      ultimoErro = erro;
      console.error(`[PAINEL] Falha ao avisar ${destino} sobre pedido ${pedido.id}:`, erro.message);
    }
  }
  return { enviada: false, motivo: ultimoErro?.message || "falha_no_envio" };
}
router.patch("/api/painel/pedidos/:id/status", exigirAutenticacao, async (req, res) => {
  const permitidos = new Set(["aguardando_pagamento", "pago", "confirmado", "em_preparo", "pronto", "compartilhado", "saiu_entrega", "concluido", "cancelado"]);
  const status = String(req.body?.status || "");
  if (!permitidos.has(status)) return res.status(400).json({ erro: "Status inválido." });

  const arquivo = garantirArquivo("pedidos.json", "services/monitoramento/relatorio/pedidos.json", []);
  const pedidos = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const pedido = pedidos.find(item => String(item.id) === req.params.id);
  if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
  const statusAnterior = pedido.status;
  pedido.status = status;
  pedido.atualizadoEm = new Date().toISOString();
  if (status === "pago" && !pedido.pagoEm) pedido.pagoEm = pedido.atualizadoEm;
  const pedidoCompleto = obterDadosPainel().pedidos.find(item => String(item.id) === String(pedido.id));
  const notificacao = statusAnterior === status
    ? { enviada: false, motivo: "status_inalterado" }
    : await notificarStatusCliente({ ...(pedidoCompleto || pedido), status }, status);
  if (status === "saiu_entrega" && !notificacao.enviada) {
    pedido.status = statusAnterior;
    return res.status(502).json({
      erro: `Não foi possível avisar o cliente: ${notificacao.motivo}. O pedido continua em Pronto para você tentar novamente.`
    });
  }
  fs.writeFileSync(arquivo, JSON.stringify(pedidos, null, 2), "utf8");
  res.json({ ...pedido, notificacao });
});

router.get("/api/painel/configuracao-publica", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(obterConfiguracaoPainel());
});

module.exports = router;

