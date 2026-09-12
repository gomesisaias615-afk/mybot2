const $ = seletor => document.querySelector(seletor);
const estado = { dados: null, tipoEstoque: "todos", busca: "", filtro: "todos" };
const portalPainel = window.MYBOT_PORTAL === "atendente" ? "atendente" : "administrador";
const guiasPermitidas = portalPainel === "atendente" ? ["pedidos", "historico"] : ["estoque", "precos", "itens", "ingredientes", "imagens", "adicionais", "horario", "taxa", "ajuda"];
const ZOOM_INICIAL_PIZZARIA = 15;

async function api(url, opcoes = {}) {
  const resposta = await fetch(url, {
    ...opcoes,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-MyBot-Portal": portalPainel, ...(opcoes.headers || {}) }
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir a operação.");
  return dados;
}

function toast(texto) {
  const el = $("#toast");
  el.textContent = texto;
  el.classList.add("visivel");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visivel"), 2600);
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textoStatus(status) {
  return ({ aguardando_pagamento: "Aguardando pagamento", pago: "Pago", confirmado: "Confirmado", em_preparo: "Em preparo", pronto: "Pronto", saiu_entrega: "Saiu para entrega", compartilhado: "Compartilhado", concluido: "Concluído", cancelado: "Recusado" })[status] || status;
}

function escapar(texto) {
  const el = document.createElement("div");
  el.textContent = String(texto ?? "");
  return el.innerHTML;
}

function pedidosDemonstracao() {
  const agora = Date.now();
  const criar = (numero, minutos, status, modalidade, nome, pizzas, pagamento = "pix") => ({
    id: `DEMO-${String(numero).padStart(3, "0")}`,
    demonstracao: true,
    status,
    criadoEm: new Date(agora - minutos * 60000).toISOString(),
    atualizadoEm: new Date(agora - Math.max(1, minutos - 3) * 60000).toISOString(),
    pagoEm: pagamento === "pix" ? new Date(agora - minutos * 60000).toISOString() : null,
    pizzas,
    bebidas: numero % 2 ? [{ quantidade: 1, nome: "Coca-Cola 2L" }] : [],
    total: 48 + numero * 7,
    observacao: numero % 3 === 0 ? "Caprichar no recheio e cortar bem as fatias." : "",
    recebimento: {
      modalidade,
      nome,
      contato: "5579999999999",
      rua: modalidade === "entrega" ? "Rua de Demonstração" : "",
      numero: String(100 + numero),
      bairro: "Centro",
      cidade: "Estância",
      estado: "SE",
      cep: "49200000",
      complemento: numero % 2 ? "Casa" : "Apartamento",
      referencia: "Próximo à praça",
      taxaEntrega: modalidade === "entrega" ? 5 : 0,
      totalFinal: 48 + numero * 7,
      pagamento,
      pagamentoStatus: pagamento === "pix" ? "approved" : ""
    }
  });

  return [
    criar(1, 2, "pago", "entrega", "Mariana Santos", [{ quantidade: 2, sabores: ["Calabresa"], tamanho: "G" }]),
    criar(2, 6, "pago", "entrega", "Carlos Oliveira", [{ quantidade: 1, sabores: ["Portuguesa"], tamanho: "F" }], "maquininha"),
    criar(3, 11, "pago", "entrega", "Ana Beatriz", [{ quantidade: 1, sabores: ["Milho"], tamanho: "M" }, { quantidade: 1, sabores: ["Quatro Queijos"], tamanho: "G" }]),
    criar(4, 18, "em_preparo", "entrega", "João Pedro", [{ quantidade: 3, sabores: ["Frango com Catupiry"], tamanho: "G" }], "dinheiro"),
    criar(5, 27, "em_preparo", "entrega", "Fernanda Lima", [{ quantidade: 1, sabores: ["Mussarela"], tamanho: "F" }]),
    criar(6, 34, "pronto", "entrega", "Rafael Souza", [{ quantidade: 2, sabores: ["Calabresa", "Portuguesa"], tamanho: "G" }]),
    criar(7, 4, "pago", "salao", "Mesa 07", [{ quantidade: 2, sabores: ["Quatro Queijos"], tamanho: "M" }], "maquininha"),
    criar(8, 15, "em_preparo", "salao", "Mesa 12", [{ quantidade: 1, sabores: ["Portuguesa"], tamanho: "F" }], "dinheiro"),
    criar(9, 3, "pago", "retirada", "Lucas Almeida", [{ quantidade: 2, sabores: ["Milho"], tamanho: "G" }]),
    criar(10, 22, "pronto", "retirada", "Patrícia Costa", [{ quantidade: 1, sabores: ["Calabresa"], tamanho: "F" }], "maquininha")
  ];
}

async function carregar() {
  if (portalPainel === "atendente") {
    estado.dados = await api("/api/painel/dados");
    render();
    return;
  }
  [estado.dados, estado.catalogoPrecos, estado.ingredientesPizzas, estado.imagensProdutos] = await Promise.all([
    api("/api/painel/dados"), api("/api/painel/precos"), api("/api/painel/ingredientes"), api("/api/painel/imagens")
  ]);
  if (!estado.adicionaisAlterados) estado.adicionais = await api("/api/painel/adicionais");
  if (new URLSearchParams(location.search).get("demo") === "1") {
    estado.dados.pedidos = [...pedidosDemonstracao(), ...(estado.dados.pedidos || [])];
  }
  render();
}

function render() {
  const { configuracao, pedidos, estoque, diaAtual } = estado.dados;
  const abertos = pedidos.filter(p => !["concluido", "cancelado"].includes(p.status));
  const pagos = pedidos.filter(p => ["pago", "confirmado", "em_preparo", "pronto", "saiu_entrega", "concluido"].includes(p.status));
  const total = pagos.reduce((s, p) => s + Number(p.recebimento?.totalFinal ?? p.total ?? 0), 0);
  const baixos = Object.values(estoque.pizzas).concat(Object.values(estoque.bebidas)).filter(q => Number(q) <= 5).length;

  $("#resumo").innerHTML = [
    ["Pedidos em andamento", abertos.length], ["Pedidos pagos", pagos.length],
    ["Total registrado", moeda(total)], ["Itens com estoque baixo", baixos]
  ].map(([nome, valor]) => `<article class="metrica"><span>${nome}</span><strong>${valor}</strong></article>`).join("");

  const funcionandoHoje = configuracao.botAtivo && configuracao.diasFuncionamento[diaAtual];
  $("#estadoGeral").innerHTML = `<i></i> ${funcionandoHoje ? "Bot funcionando hoje" : "Bot parado hoje"}`;
  $("#alternarBot").textContent = configuracao.botAtivo ? "🟢 Bot ligado" : "🔴 Bot desligado";
  $("#alternarBot").classList.toggle("fechado", !configuracao.botAtivo);

  const nomesDias = { domingo: "Dom", segunda: "Seg", terca: "Ter", quarta: "Qua", quinta: "Qui", sexta: "Sex", sabado: "Sáb" };
  $("#diasSemana").innerHTML = Object.entries(nomesDias).map(([dia, nome]) => `<button class="dia-semana ${configuracao.diasFuncionamento[dia] ? "ativo" : ""} ${dia === diaAtual ? "hoje" : ""}" data-dia="${dia}" aria-pressed="${configuracao.diasFuncionamento[dia]}"><span>${nome}</span><small>${configuracao.diasFuncionamento[dia] ? "Ligado" : "Desligado"}</small></button>`).join("");
  if ($("#horarioAbertura")) $("#horarioAbertura").value = configuracao.horarioAbertura || "00:00";
  if ($("#horarioFechamento")) $("#horarioFechamento").value = configuracao.horarioFechamento || "00:00";
  if ($("#modoTaxaFixa")) {
    const entrega = configuracao.entrega || {};
    $("#modoTaxaFixa").checked = entrega.modoTaxa === "fixa";
    $("#modoTaxaKm").checked = entrega.modoTaxa !== "fixa";
    $("#taxaFixa").value = entrega.taxaFixa ?? 5;
    $("#valorPorKm").value = entrega.valorPorKm ?? 2;
    $("#taxaMinima").value = entrega.taxaMinima ?? 5;
    raioEntregaEstavel = normalizarRaioEntrega(entrega.distanciaMaximaKm ?? 1);
    $("#distanciaMaximaKm").value = String(raioEntregaEstavel);
    $("#raioEntregaKm").value = String(raioEntregaEstavel);
    $("#resumoAreaEntrega").textContent = "Raio atual: " + formatarRaioEntrega(raioEntregaEstavel) + " km";
    $("#medidaAreaEntrega").textContent =
      "Raio: " + formatarRaioEntrega(raioEntregaEstavel) +
      " km do centro até a borda • Diâmetro: " +
      formatarRaioEntrega(raioEntregaEstavel * 2) + " km de uma ponta à outra";
    enderecoPizzariaConfirmado = entrega.enderecoPizzaria || "";
    $("#enderecoPizzaria").value = "";
    $("#latitudePizzaria").value = entrega.latitudePizzaria ?? "";
    $("#longitudePizzaria").value = entrega.longitudePizzaria ?? "";
    $("#estadoAtendido").value = entrega.estadoAtendido || "SE";
    $("#cidadeAtendida").value = entrega.cidadeAtendida || "Estância";
    $("#municipioAtendimentoResumo").textContent =
      (entrega.cidadeAtendida || "Estância") + " — " + (entrega.estadoAtendido || "SE");
    // Number(null) vira 0 e abriria o mapa no oceano (0,0).
    const latitudeMapaTexto = String(entrega.latitudeMapaInicial ?? "").trim();
    const longitudeMapaTexto = String(entrega.longitudeMapaInicial ?? "").trim();
    const latitudeMapaInicial = latitudeMapaTexto ? Number(latitudeMapaTexto) : NaN;
    const longitudeMapaInicial = longitudeMapaTexto ? Number(longitudeMapaTexto) : NaN;
    centroMapaConfigurado =
      Number.isFinite(latitudeMapaInicial) && Number.isFinite(longitudeMapaInicial)
        ? {
            latitude: latitudeMapaInicial,
            longitude: longitudeMapaInicial,
            zoom: ZOOM_INICIAL_PIZZARIA
          }
        : null;
    const latitude = Number(entrega.latitudePizzaria);
    const longitude = Number(entrega.longitudePizzaria);
    const localValido = Boolean(enderecoPizzariaConfirmado) && Number.isFinite(latitude) && Number.isFinite(longitude);
    $("#localPizzariaSelecionado").textContent = localValido
      ? `✅ Localização confirmada: ${entrega.enderecoPizzaria || "ponto salvo no mapa"}`
      : "Nenhuma localização confirmada.";
    $("#localPizzariaSelecionado").classList.toggle("confirmado", localValido);
    atualizarDisponibilidadeAreaEntrega();
    atualizarCamposModoTaxa();
  }

  renderPedidos();
  renderEstoque();
}

function renderPedidos() {
  let pedidos = estado.dados.pedidos;
  if (estado.filtro === "abertos") pedidos = pedidos.filter(p => !["concluido", "cancelado"].includes(p.status));
  else if (estado.filtro !== "todos") pedidos = pedidos.filter(p => p.status === estado.filtro);

  $("#pedidos").innerHTML = pedidos.length ? pedidos.map(p => {
    const pizzas = (p.pizzas || []).map(i => `${i.quantidade}× ${i.sabor || (i.sabores || []).join("/")} ${i.tamanho || ""}`);
    const bebidas = (p.bebidas || []).map(i => `${i.quantidade}× ${i.nome || i.chave}`);
    const rec = p.recebimento || {};
    const endereco = rec.modalidade === "entrega" ? `${rec.rua || ""}, ${rec.numero || ""} — ${rec.bairro || ""}` : (rec.modalidade || "Não informado");
    return `<article class="pedido"><div class="pedido-topo"><div><div class="pedido-id">#${escapar(p.id)}</div><div class="pedido-data">${new Date(p.criadoEm || Date.now()).toLocaleString("pt-BR")}</div></div><span class="badge ${p.status}">${textoStatus(p.status)}</span></div><div class="itens">${[...pizzas, ...bebidas].map(escapar).join("<br>") || "Itens não informados"}${p.observacaoPizzas ? `<br><strong>Observação: ${escapar(p.observacaoPizzas)}</strong>` : ""}</div><div class="pedido-info"><span>Cliente<br><strong>${escapar(rec.nome || p.cliente)}</strong></span><span>Total<br><strong>${moeda(rec.totalFinal ?? p.total)}</strong></span><span>Recebimento<br><strong>${escapar(endereco)}</strong></span><span>Pagamento<br><strong>${escapar(rec.pagamento || p.pagamento || "Não informado")}</strong></span></div><select class="status-pedido" data-id="${escapar(p.id)}">${["aguardando_pagamento","pago","confirmado","em_preparo","pronto","compartilhado","saiu_entrega","concluido","cancelado"].map(s => `<option value="${s}" ${p.status === s ? "selected" : ""}>${textoStatus(s)}</option>`).join("")}</select></article>`;
  }).join("") : `<div class="vazio">Nenhum pedido nesta categoria.</div>`;
}

function renderEstoque() {
  const busca=normalizarBuscaPainel(estado.busca);const produtos = Object.entries(estado.dados.estoque[estado.tipoEstoque] || {}).filter(([nome]) => {const exibido=estado.tipoEstoque==="pizzas"?nomePizzaPainel(nome.replaceAll("_"," ")):nome.replaceAll("_"," ");const termos=exibido+" "+nome+" "+(estado.tipoEstoque==="pizzas"?"hambúrguer hambúrgueres":"bebida bebidas");return normalizarBuscaPainel(termos).includes(busca)});
  $("#estoque").innerHTML = produtos.map(([nome, qtd]) => { const titulo=estado.tipoEstoque==="pizzas"?`Hambúrguer de ${nome.replaceAll("_", " ")}`:nome.replaceAll("_", " "); return `<div class="produto"><div><div class="produto-nome">${escapar(titulo)}</div><small>${Number(qtd) === 0 ? "Indisponível" : Number(qtd) <= 5 ? "Estoque baixo" : "Disponível"}</small></div><div class="quantidade"><button data-delta="-1" data-tipo="${estado.tipoEstoque}" data-chave="${escapar(nome)}">−</button><input value="${Number(qtd)}" inputmode="numeric" data-qtd data-tipo="${estado.tipoEstoque}" data-chave="${escapar(nome)}"><button data-delta="1" data-tipo="${estado.tipoEstoque}" data-chave="${escapar(nome)}">+</button></div></div>`; }).join("");
}

async function atualizarConfig(chave, valor) {
  await api("/api/painel/configuracao", { method: "PATCH", body: JSON.stringify({ [chave]: valor }) });
  await carregar(); toast("Configuração atualizada.");
}

async function atualizarEstoque(tipo, chave, quantidade) {
  await api("/api/painel/estoque", { method: "PATCH", body: JSON.stringify({ tipo, chave, quantidade }) });
  estado.dados.estoque[tipo][chave] = quantidade; renderEstoque(); if (estado.catalogoPrecoAtual === "promocoes") renderPrecos(); toast("Estoque sincronizado.");
}

document.addEventListener("click", async evento => {
  try {
    const dia = evento.target.closest("[data-dia]");
    if (dia) return atualizarConfig("diasFuncionamento", { [dia.dataset.dia]: !estado.dados.configuracao.diasFuncionamento[dia.dataset.dia] });
    const delta = evento.target.closest("[data-delta]");
    if (delta) {
      const atual = Number(estado.dados.estoque[delta.dataset.tipo][delta.dataset.chave]) || 0;
      return atualizarEstoque(delta.dataset.tipo, delta.dataset.chave, Math.max(0, atual + Number(delta.dataset.delta)));
    }
    const aba = evento.target.closest(".aba-estoque");
    if (aba) { document.querySelectorAll(".aba-estoque").forEach(a => a.classList.remove("ativa")); aba.classList.add("ativa"); estado.tipoEstoque = aba.dataset.tipo; renderEstoque(); }
  } catch (erro) { toast(erro.message); }
});

document.addEventListener("change", async evento => {
  try {
    if (evento.target.matches("[data-qtd]")) return atualizarEstoque(evento.target.dataset.tipo, evento.target.dataset.chave, Math.max(0, Number(evento.target.value) || 0));
    if (evento.target.matches(".status-pedido")) { const resultado = await api(`/api/painel/pedidos/${encodeURIComponent(evento.target.dataset.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: evento.target.value }) }); await carregar(); toast(resultado.notificacao?.enviada ? "Status atualizado e cliente avisado." : "Status do pedido atualizado."); }
  } catch (erro) { toast(erro.message); }
});

$("#loginForm").addEventListener("submit", async evento => { evento.preventDefault(); try { await api("/api/painel/entrar", { method: "POST", body: JSON.stringify({ token: $("#token").value, perfil: portalPainel }) }); $("#login").classList.add("oculto"); $("#aplicacao").classList.remove("oculto"); await carregar(); } catch (erro) { $("#loginErro").textContent = erro.message; } });
$("#atualizar").addEventListener("click", () => carregar().then(() => toast("Painel atualizado.")).catch(e => toast(e.message)));
// Indicador somente visual: o status do bot não é alterado pelo painel.
$("#salvarHorario").addEventListener("click", async () => {
  const abertura = $("#horarioAbertura").value;
  const fechamento = $("#horarioFechamento").value;
  if (!abertura || !fechamento) return toast("Informe os horários de abertura e fechamento.");
  const botao = $("#salvarHorario");
  try {
    botao.disabled = true;
    botao.textContent = "Salvando...";
    await api("/api/painel/configuracao", { method: "PATCH", body: JSON.stringify({ horarioAbertura: abertura, horarioFechamento: fechamento }) });
    await carregar();
    toast("Horário de atendimento atualizado.");
  } catch (erro) { toast(erro.message); }
  finally { botao.disabled = false; botao.textContent = "Salvar horário"; }
});
function atualizarCamposModoTaxa() {
  const modo = document.querySelector('input[name="modoTaxa"]:checked')?.value || "por_km";
  document.querySelectorAll("[data-campo-modo]").forEach(campo => {
    const ativo = campo.dataset.campoModo === modo;
    campo.classList.toggle("campo-inativo", !ativo);
    campo.querySelectorAll("input").forEach(input => { input.disabled = !ativo; });
  });
  document.querySelectorAll(".modo-taxa").forEach(label => {
    label.classList.toggle("ativo", label.querySelector("input").checked);
  });
}

document.querySelectorAll('input[name="modoTaxa"]').forEach(input => {
  input.addEventListener("change", atualizarCamposModoTaxa);
});

let mapaPizzaria;
let marcadorPizzaria;
let pontoMapaPizzaria = null;
let enderecoMapaPizzaria = "";
let enderecoMapaPizzariaValido = false;
let enderecoPizzariaConfirmado = "";
let buscaLocalTimer;
let consultaMapaAtual = 0;
let consultaMapaTimer;
let centroMapaConfigurado = null;

let mapaAreaEntrega;
let marcadorCentroArea;
let circuloAreaEntrega;
let raioEntregaEstavel = 1;

function atualizarDisponibilidadeAreaEntrega() {
  const latitudeTexto = $("#latitudePizzaria").value;
  const longitudeTexto = $("#longitudePizzaria").value;
  const latitude = Number(latitudeTexto);
  const longitude = Number(longitudeTexto);
  const enderecoConfirmado = Boolean(String(enderecoPizzariaConfirmado || "").trim());
  const podeDefinirArea = enderecoConfirmado && latitudeTexto && longitudeTexto &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  $("#abrirMapaAreaEntrega").disabled = !podeDefinirArea;
  return podeDefinirArea;
}

const CENTROS_ESTADOS_BR = {
  AC: { latitude: -9.0238, longitude: -70.812, zoom: 7 },
  AL: { latitude: -9.5713, longitude: -36.782, zoom: 8 },
  AP: { latitude: 1.41, longitude: -51.77, zoom: 7 },
  AM: { latitude: -3.4168, longitude: -65.8561, zoom: 6 },
  BA: { latitude: -12.5797, longitude: -41.7007, zoom: 7 },
  CE: { latitude: -5.4984, longitude: -39.3206, zoom: 7 },
  DF: { latitude: -15.7998, longitude: -47.8645, zoom: 9 },
  ES: { latitude: -19.1834, longitude: -40.3089, zoom: 8 },
  GO: { latitude: -15.827, longitude: -49.8362, zoom: 7 },
  MA: { latitude: -5.42, longitude: -45.44, zoom: 7 },
  MT: { latitude: -12.6819, longitude: -56.9211, zoom: 6 },
  MS: { latitude: -20.7722, longitude: -54.7852, zoom: 7 },
  MG: { latitude: -18.5122, longitude: -44.555, zoom: 7 },
  PA: { latitude: -3.4168, longitude: -52.218, zoom: 6 },
  PB: { latitude: -7.2399, longitude: -36.7819, zoom: 8 },
  PR: { latitude: -24.894, longitude: -51.55, zoom: 7 },
  PE: { latitude: -8.8137, longitude: -36.9541, zoom: 7 },
  PI: { latitude: -7.7183, longitude: -42.7289, zoom: 7 },
  RJ: { latitude: -22.25, longitude: -42.66, zoom: 8 },
  RN: { latitude: -5.4026, longitude: -36.9541, zoom: 8 },
  RS: { latitude: -30.17, longitude: -53.5, zoom: 7 },
  RO: { latitude: -10.83, longitude: -63.34, zoom: 7 },
  RR: { latitude: 2.7376, longitude: -62.0751, zoom: 7 },
  SC: { latitude: -27.2423, longitude: -50.2189, zoom: 7 },
  SP: { latitude: -22.19, longitude: -48.79, zoom: 7 },
  SE: { latitude: -10.5741, longitude: -37.3857, zoom: 8 },
  TO: { latitude: -10.1753, longitude: -48.2982, zoom: 7 }
};

function coordenadasPizzariaAtuais() {
  const latitudeTexto = $("#latitudePizzaria").value;
  const longitudeTexto = $("#longitudePizzaria").value;
  const latitude = Number(latitudeTexto);
  const longitude = Number(longitudeTexto);
  const possuiCoordenadas = latitudeTexto && longitudeTexto &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  // Mesmo com endereço já salvo, mantenha o enquadramento inicial escolhido.
  // Antes este trecho forçava 19 e ignorava o zoom configurado.
  if (possuiCoordenadas) return { latitude, longitude, zoom: ZOOM_INICIAL_PIZZARIA };
  if (centroMapaConfigurado) return { ...centroMapaConfigurado, zoom: ZOOM_INICIAL_PIZZARIA };
  const estado = String($("#estadoAtendido").value || "").toUpperCase();
  return CENTROS_ESTADOS_BR[estado] || { latitude: -14.235, longitude: -51.9253, zoom: 4 };
}

async function consultarEnderecoDoPonto(latitude, longitude) {
  const controle = ++consultaMapaAtual;
  $("#statusMapaPizzaria").textContent = "Buscando rua, bairro e cidade...";
  try {
    const endereco = await api("/api/painel/localizacao/reversa?lat=" + encodeURIComponent(latitude) + "&lon=" + encodeURIComponent(longitude) + "&_=" + Date.now(), { cache: "no-store" });
    if (controle !== consultaMapaAtual) return false;
    const texto = String(endereco.texto || "").trim();
    const possuiEnderecoReal = endereco.enderecoEncontrado !== false &&
      Boolean(texto) && Boolean(endereco.rua || endereco.bairro || endereco.cidade);
    if (!possuiEnderecoReal) {
      throw new Error(endereco.erro || "Não foi possível identificar rua e bairro neste ponto.");
    }
    enderecoMapaPizzaria = texto;
    enderecoMapaPizzariaValido = true;
    $("#statusMapaPizzaria").textContent = texto;
    return true;
  } catch (erro) {
    if (controle !== consultaMapaAtual) return false;
    enderecoMapaPizzaria = "";
    enderecoMapaPizzariaValido = false;
    $("#statusMapaPizzaria").textContent =
      erro.message || "Não foi possível identificar o endereço. Toque exatamente sobre uma rua.";
    return false;
  }
}

function agendarConsultaEnderecoDoPonto(latitude, longitude) {
  clearTimeout(consultaMapaTimer);
  $("#statusMapaPizzaria").textContent = "Aguardando você terminar de posicionar o marcador...";
  consultaMapaTimer = setTimeout(() => {
    consultarEnderecoDoPonto(latitude, longitude);
  }, 650);
}


function atualizarPontoPizzaria(latitude, longitude, centralizar = false, buscarEndereco = true) {
  pontoMapaPizzaria = { latitude: Number(latitude), longitude: Number(longitude) };
  if (marcadorPizzaria) marcadorPizzaria.setLatLng([pontoMapaPizzaria.latitude, pontoMapaPizzaria.longitude]);
  if (centralizar && mapaPizzaria) mapaPizzaria.panTo([pontoMapaPizzaria.latitude, pontoMapaPizzaria.longitude], { animate: true, duration: .25 });
  if (buscarEndereco) {
    consultaMapaAtual += 1;
    enderecoMapaPizzaria = "";
    enderecoMapaPizzariaValido = false;
    agendarConsultaEnderecoDoPonto(pontoMapaPizzaria.latitude, pontoMapaPizzaria.longitude);
  }
}


async function aguardarContainerDoMapa(id) {
  const elemento = document.getElementById(id);
  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    const largura = elemento?.clientWidth || 0;
    const altura = elemento?.clientHeight || 0;
    if (largura > 100 && altura > 100) return true;
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));
  }
  return false;
}

function criarIconeCentroMapa() {
  return L.divIcon({
    className: "marcador-centro-mapa",
    html: '<span aria-hidden="true"><b>🍕</b></span>',
    iconSize: [44, 44],
    iconAnchor: [22, 40]
  });
}

function adicionarMapaBase(mapa) {
  let reservaAtivada = false;
  const principal = L.tileLayer("/api/mapa/tiles/{z}/{x}/{y}.png", {
    maxZoom: 19,
    crossOrigin: true,
    updateWhenIdle: false,
    keepBuffer: 4,
    attribution: "&copy; OpenStreetMap"
  });

  principal.on("tileerror", () => {
    if (reservaAtivada) return;
    reservaAtivada = true;
    mapa.removeLayer(principal);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      crossOrigin: true,
      updateWhenIdle: false,
      keepBuffer: 4,
      attribution: "&copy; OpenStreetMap &copy; CARTO"
    }).addTo(mapa);
  });

  principal.addTo(mapa);
}

function atualizarMapaVisivel(mapa) {
  [80, 350, 900].forEach(atraso => {
    setTimeout(() => {
      mapa.invalidateSize({ pan: false });
      mapa.eachLayer(camada => {
        if (typeof camada.redraw === "function") camada.redraw();
      });
    }, atraso);
  });
}

async function abrirMapaDaPizzaria(latitude, longitude, zoomInicial = 19) {
  if (typeof L === "undefined") return toast("O mapa não carregou. Verifique sua internet.");
  $("#modalLocalPizzaria").classList.remove("hidden");
  document.body.classList.add("modal-local-aberto");

  const visivel = await aguardarContainerDoMapa("mapaPizzaria");
  if (!visivel || $("#modalLocalPizzaria").classList.contains("hidden")) {
    return toast("Não foi possível preparar o mapa. Feche e tente novamente.");
  }

  if (mapaPizzaria) mapaPizzaria.remove();
  mapaPizzaria = L.map("mapaPizzaria", {
    zoomControl: true,
    attributionControl: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    preferCanvas: true
  });
  adicionarMapaBase(mapaPizzaria);
  marcadorPizzaria = L.marker([latitude, longitude], {
    draggable: true,
    title: "Local da hamburgueria",
    icon: criarIconeCentroMapa()
  }).addTo(mapaPizzaria);
  marcadorPizzaria.on("dragend", evento => {
    const ponto = evento.target.getLatLng();
    atualizarPontoPizzaria(ponto.lat, ponto.lng);
  });
  mapaPizzaria.on("click", evento => atualizarPontoPizzaria(evento.latlng.lat, evento.latlng.lng, true));

  enderecoMapaPizzaria = enderecoPizzariaConfirmado;
  enderecoMapaPizzariaValido = Boolean(enderecoMapaPizzaria);
  pontoMapaPizzaria = { latitude: Number(latitude), longitude: Number(longitude) };
  $("#statusMapaPizzaria").textContent = enderecoMapaPizzaria ||
    (zoomInicial <= 4 ? "Mapa geral do Brasil. Aproxime e toque no local da hamburgueria." : "Mova o marcador ou toque no mapa para escolher o endereço.");
  mapaPizzaria.setView([latitude, longitude], zoomInicial, { animate: false });
  atualizarMapaVisivel(mapaPizzaria);
}

function fecharMapaDaPizzaria() {
  $("#modalLocalPizzaria").classList.add("hidden");
  document.body.classList.remove("modal-local-aberto");
}

async function confirmarLocalPizzaria(latitude, longitude, endereco) {
  const latitudeNumero = Number(latitude);
  const longitudeNumero = Number(longitude);
  const enderecoNormalizado = String(endereco || "").trim();
  if (
    !enderecoNormalizado ||
    !Number.isFinite(latitudeNumero) ||
    !Number.isFinite(longitudeNumero) ||
    Math.abs(latitudeNumero) > 90 ||
    Math.abs(longitudeNumero) > 180
  ) {
    throw new Error("Não foi possível confirmar este endereço.");
  }

  const resposta = await api("/api/painel/configuracao", {
    method: "PATCH",
    body: JSON.stringify({
      entrega: {
        enderecoPizzaria: enderecoNormalizado,
        latitudePizzaria: latitudeNumero,
        longitudePizzaria: longitudeNumero,
        distanciaMaximaKm: raioAtualEntrega()
      }
    })
  });
  const entregaSalva = resposta?.entrega || {};
  if (
    !String(entregaSalva.enderecoPizzaria || "").trim() ||
    !Number.isFinite(Number(entregaSalva.latitudePizzaria)) ||
    !Number.isFinite(Number(entregaSalva.longitudePizzaria))
  ) {
    throw new Error("O servidor não confirmou o salvamento do endereço.");
  }

  $("#latitudePizzaria").value = String(entregaSalva.latitudePizzaria);
  $("#longitudePizzaria").value = String(entregaSalva.longitudePizzaria);
  enderecoPizzariaConfirmado = String(entregaSalva.enderecoPizzaria).trim();
  enderecoMapaPizzaria = enderecoPizzariaConfirmado;
  enderecoMapaPizzariaValido = true;
  $("#enderecoPizzaria").value = "";
  $("#localPizzariaSelecionado").textContent = "✅ Endereço salvo: " + enderecoPizzariaConfirmado;
  $("#localPizzariaSelecionado").classList.add("confirmado");
  atualizarDisponibilidadeAreaEntrega();
  return entregaSalva;
}

async function buscarEnderecoPizzaria() {
  const busca = $("#enderecoPizzaria").value.trim();
  const cidade = $("#cidadeAtendida").value.trim();
  const estado = $("#estadoAtendido").value.trim().toUpperCase();
  const caixa = $("#sugestoesLocalPizzaria");
  if (busca.length < 2 || !cidade || estado.length !== 2) {
    caixa.classList.add("hidden");
    caixa.innerHTML = "";
    return;
  }
  caixa.classList.remove("hidden");
  caixa.innerHTML = "<p>Buscando no mapa...</p>";
  try {
    const itens = await api("/api/enderecos/sugestoes?q=" + encodeURIComponent(busca) + "&cidade=" + encodeURIComponent(cidade) + "&estado=" + encodeURIComponent(estado));
    if (!itens.length) {
      caixa.innerHTML = "<p>Nenhum endereço encontrado. Confira cidade, estado e endereço.</p>";
      return;
    }
    caixa.innerHTML = itens.map((item, indice) =>
      '<button type="button" data-indice="' + indice + '"><strong>' + escapar(item.logradouro || item.rua || "Endereço") + '</strong><small>' + escapar(item.texto || [item.bairro,item.cidade,item.estado].filter(Boolean).join(" — ")) + '</small></button>'
    ).join("");
    caixa.querySelectorAll("button").forEach((botao, indice) => botao.addEventListener("click", async () => {
      const item = itens[indice];
      const textoOriginal = botao.innerHTML;
      try {
        botao.disabled = true;
        botao.textContent = "Salvando endereço...";
        await confirmarLocalPizzaria(item.latitude, item.longitude, item.texto);
        caixa.classList.add("hidden");
        toast("Endereço da hamburgueria salvo.");
      } catch (erro) {
        botao.disabled = false;
        botao.innerHTML = textoOriginal;
        toast(erro.message);
      }
    }));
  } catch (erro) {
    caixa.innerHTML = "<p>" + escapar(erro.message) + "</p>";
  }
}

$("#enderecoPizzaria").addEventListener("input", () => {
  clearTimeout(buscaLocalTimer);
  buscaLocalTimer = setTimeout(buscarEnderecoPizzaria, 750);
});

function normalizarRaioEntrega(valor) {
  const numero = Number(String(valor).replace(",", "."));
  return Math.min(200, Math.max(0.5, Math.round((Number.isFinite(numero) ? numero : 0.5) * 2) / 2));
}

function formatarRaioEntrega(valor) {
  const numero = Number(String(valor).replace(",", "."));
  return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function raioAtualEntrega() {
  return normalizarRaioEntrega(raioEntregaEstavel);
}

function atualizarRaioEntrega(valor) {
  const numero = normalizarRaioEntrega(valor);
  raioEntregaEstavel = numero;
  $("#raioEntregaKm").value = String(numero);
  $("#distanciaMaximaKm").value = String(numero);
  $("#resumoAreaEntrega").textContent = "Raio atual: " + formatarRaioEntrega(numero) + " km";
  $("#medidaAreaEntrega").textContent =
    "Raio: " + formatarRaioEntrega(numero) + " km do centro até a borda • Diâmetro: " +
    formatarRaioEntrega(numero * 2) + " km de uma ponta à outra";
  if (circuloAreaEntrega) circuloAreaEntrega.setRadius(numero * 1000);
  return numero;
}

async function abrirMapaDaArea() {
  if (typeof L === "undefined") return toast("O mapa não carregou. Verifique sua internet.");
  if (!atualizarDisponibilidadeAreaEntrega()) {
    return toast("Primeiro adicione e confirme o endereço da hamburgueria.");
  }
  const latitudeTexto = $("#latitudePizzaria").value;
  const longitudeTexto = $("#longitudePizzaria").value;
  const latitude = Number(latitudeTexto);
  const longitude = Number(longitudeTexto);
  if (!latitudeTexto || !longitudeTexto || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return toast("Primeiro pesquise e confirme a localização da hamburgueria.");
  }

  $("#modalAreaEntrega").classList.remove("hidden");
  document.body.classList.add("modal-local-aberto");

  const visivel = await aguardarContainerDoMapa("mapaAreaEntrega");
  if (!visivel || $("#modalAreaEntrega").classList.contains("hidden")) {
    return toast("Não foi possível preparar o mapa. Feche e tente novamente.");
  }

  if (mapaAreaEntrega) mapaAreaEntrega.remove();
  mapaAreaEntrega = null;
  marcadorCentroArea = null;
  circuloAreaEntrega = null;

  mapaAreaEntrega = L.map("mapaAreaEntrega", {
    zoomControl: true,
    attributionControl: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    preferCanvas: false
  });
  adicionarMapaBase(mapaAreaEntrega);

  // O mapa recebe centro e zoom antes do círculo. Assim ele continua
  // funcionando mesmo se o navegador não conseguir desenhar a área.
  mapaAreaEntrega.setView([latitude, longitude], 13, { animate: false });
  marcadorCentroArea = L.marker([latitude, longitude], {
    draggable: false,
    title: "Hamburgueria — centro da área",
    icon: criarIconeCentroMapa()
  }).addTo(mapaAreaEntrega);

  try {
    circuloAreaEntrega = L.circle([latitude, longitude], {
      radius: raioAtualEntrega() * 1000,
      color: "#087d4d",
      weight: 4,
      opacity: 1,
      fillColor: "#24c777",
      fillOpacity: .22,
      interactive: false
    }).addTo(mapaAreaEntrega);
  } catch (erro) {
    circuloAreaEntrega = null;
    console.error("Não foi possível desenhar o círculo da área:", erro);
  }

  // O mapa só altera a visualização. O raio fica em uma variável separada
  // e nunca é recalculado a partir do zoom, arraste ou gesto no mapa.
  atualizarRaioEntrega(raioAtualEntrega());
  ["movestart", "move", "moveend", "zoomstart", "zoom", "zoomend"].forEach(nomeEvento => {
    mapaAreaEntrega.on(nomeEvento, () => {
      const valorCorreto = String(raioEntregaEstavel);
      if ($("#raioEntregaKm").value !== valorCorreto) $("#raioEntregaKm").value = valorCorreto;
      if ($("#distanciaMaximaKm").value !== valorCorreto) $("#distanciaMaximaKm").value = valorCorreto;
    });
  });
  atualizarMapaVisivel(mapaAreaEntrega);
}

function fecharMapaDaArea() {
  $("#modalAreaEntrega").classList.add("hidden");
  document.body.classList.remove("modal-local-aberto");
}

$("#raioEntregaKm").addEventListener("wheel", evento => {
  evento.preventDefault();
  evento.currentTarget.blur();
}, { passive: false });

$("#raioEntregaKm").addEventListener("input", evento => {
  const valor = Number(evento.currentTarget.value);
  if (Number.isFinite(valor) && valor >= 0.5) atualizarRaioEntrega(valor, false);
});
$("#raioEntregaKm").addEventListener("change", evento => atualizarRaioEntrega(evento.currentTarget.value));
$("#diminuirRaioEntrega").addEventListener("click", () => atualizarRaioEntrega(raioAtualEntrega() - 0.5));
$("#aumentarRaioEntrega").addEventListener("click", () => atualizarRaioEntrega(raioAtualEntrega() + 0.5));

$("#abrirMapaPizzaria").addEventListener("click", () => {
  const ponto = coordenadasPizzariaAtuais();
  abrirMapaDaPizzaria(ponto.latitude, ponto.longitude, ponto.zoom);
});
$("#confirmarMapaPizzaria").addEventListener("click", async () => {
  if (!pontoMapaPizzaria) return toast("Escolha um ponto no mapa.");
  clearTimeout(consultaMapaTimer);
  if (!enderecoMapaPizzariaValido) {
    await consultarEnderecoDoPonto(pontoMapaPizzaria.latitude, pontoMapaPizzaria.longitude);
  }
  if (!enderecoMapaPizzariaValido || !enderecoMapaPizzaria) {
    return toast("Não foi possível identificar rua e bairro. Toque exatamente sobre uma rua ou pesquise o endereço pelo nome.");
  }
  const botao = $("#confirmarMapaPizzaria");
  try {
    botao.disabled = true;
    botao.textContent = "Salvando endereço...";
    await confirmarLocalPizzaria(pontoMapaPizzaria.latitude, pontoMapaPizzaria.longitude, enderecoMapaPizzaria);
    fecharMapaDaPizzaria();
    toast("Endereço da hamburgueria salvo.");
  } catch (erro) {
    toast(erro.message);
  } finally {
    botao.disabled = false;
    botao.textContent = "Confirmar localização";
  }
});
$("#fecharMapaPizzaria").addEventListener("click", fecharMapaDaPizzaria);
$("#cancelarMapaPizzaria").addEventListener("click", fecharMapaDaPizzaria);
$("#modalLocalPizzaria").addEventListener("click", evento => {
  if (evento.target === evento.currentTarget) fecharMapaDaPizzaria();
});

$("#abrirMapaAreaEntrega").addEventListener("click", abrirMapaDaArea);
$("#confirmarAreaEntrega").addEventListener("click", () => {
  atualizarRaioEntrega($("#raioEntregaKm").value, false);
  fecharMapaDaArea();
  toast("Área de atendimento definida.");
});
$("#fecharMapaAreaEntrega").addEventListener("click", fecharMapaDaArea);
$("#cancelarMapaAreaEntrega").addEventListener("click", fecharMapaDaArea);
$("#modalAreaEntrega").addEventListener("click", evento => {
  if (evento.target === evento.currentTarget) fecharMapaDaArea();
});

$("#salvarEntrega").addEventListener("click", async () => {
  const botao = $("#salvarEntrega");
  const modoTaxa = document.querySelector('input[name="modoTaxa"]:checked')?.value;
  if (!modoTaxa) return toast("Escolha valor fixo ou valor por km.");
  const entrega = {
    modoTaxa,
    taxaFixa: Number($("#taxaFixa").value),
    valorPorKm: Number($("#valorPorKm").value),
    taxaMinima: Number($("#taxaMinima").value),
    distanciaMaximaKm: Number($("#distanciaMaximaKm").value),
    enderecoPizzaria: enderecoPizzariaConfirmado,
    latitudePizzaria: Number($("#latitudePizzaria").value),
    longitudePizzaria: Number($("#longitudePizzaria").value),
    estadoAtendido: $("#estadoAtendido").value.trim().toUpperCase(),
    cidadeAtendida: $("#cidadeAtendida").value.trim()
  };
  if (!entrega.enderecoPizzaria || !entrega.cidadeAtendida || entrega.estadoAtendido.length !== 2) {
    return toast("Confira o endereço, a cidade e o estado atendido.");
  }
  if (
    !$("#latitudePizzaria").value ||
    !$("#longitudePizzaria").value ||
    !Number.isFinite(entrega.latitudePizzaria) ||
    !Number.isFinite(entrega.longitudePizzaria) ||
    Math.abs(entrega.latitudePizzaria) > 90 ||
    Math.abs(entrega.longitudePizzaria) > 180
  ) {
    return toast("Pesquise o endereço e confirme a localização no mapa.");
  }
  try {
    botao.disabled = true;
    botao.textContent = "Salvando...";
    await api("/api/painel/configuracao", { method: "PATCH", body: JSON.stringify({ entrega }) });
    await carregar();
    toast("Taxa, localização e área salvas.");
  } catch (erro) { toast(erro.message); }
  finally { botao.disabled = false; botao.textContent = "Salvar taxa, localização e área"; }
});

$("#filtroPedidos").addEventListener("change", e => { estado.filtro = e.target.value; renderPedidos(); });
$("#buscarEstoque").addEventListener("input", e => { estado.busca = e.target.value.toLowerCase().trim(); renderEstoque(); });
$("#sair").addEventListener("click", async () => { await api("/api/painel/sair", { method: "POST" }); location.reload(); });

let validacaoSessaoEmAndamento;

function ocultarPainelDuranteValidacao() {
  $("#aplicacao").classList.add("oculto");
  $("#login").classList.add("oculto");
}

function mostrarLoginPainel() {
  $("#aplicacao").classList.add("oculto");
  $("#login").classList.remove("oculto");
}

// Não atualiza dados automaticamente enquanto o atendente está preenchendo
// uma área de edição. Assim o texto digitado não é substituído pelo servidor.
function podeAtualizarDadosAutomaticamente() {
  return !["pedidos", "itens", "ingredientes", "precos", "imagens", "horario", "taxa", "adicionais"].includes(estado.guia);
}

// Pedidos precisam chegar ao atendente sem atualizar o painel inteiro. A
// atualização completa apaga campos que alguém pode estar preenchendo em
// outras abas; aqui buscamos somente os dados operacionais e redesenhamos os
// cartões quando a aba Pedidos estiver visível.
let atualizacaoPedidosEmAndamento = false;
let pedidosJaVistos = null;

function atualizarBotaoNotificacoes() {
  const botao = $("#ativarNotificacoes");
  if (!botao || portalPainel !== "atendente" || !("Notification" in window)) return;
  botao.hidden = false;
  const ativo = Notification.permission === "granted";
  botao.classList.toggle("ativo", ativo);
  botao.textContent = ativo ? "🔔 NOTIFICAÇÕES ATIVADAS" : "🔔 RECEBER NOTIFICAÇÕES";
}

async function ativarNotificacoes() {
  if (!("Notification" in window)) return toast("Este navegador não oferece notificações.");
  const permissao = await Notification.requestPermission();
  atualizarBotaoNotificacoes();
  toast(permissao === "granted" ? "Você receberá avisos de novos pedidos." : "Permissão de notificações não concedida.");
}

function avisarPedidosNovos(pedidos) {
  if (portalPainel !== "atendente") return;
  const ids = new Set((pedidos || []).map(pedido => String(pedido.id)));
  if (pedidosJaVistos === null) { pedidosJaVistos = ids; return; }
  const novos = (pedidos || []).filter(pedido => !pedidosJaVistos.has(String(pedido.id)));
  pedidosJaVistos = ids;
  if (!novos.length || Notification.permission !== "granted") return;
  novos.forEach(pedido => new Notification("Novo pedido MyBot", {
    body: `Pedido #${pedido.id} recebido. Abra o painel para atender.`,
    icon: "/painel/mybot-logo-verde.png",
    tag: `pedido-${pedido.id}`
  }));
}
async function atualizarPedidosAutomaticamente() {
  if (
    atualizacaoPedidosEmAndamento ||
    estado.guia !== "pedidos" ||
    $("#aplicacao").classList.contains("oculto")
  ) return;

  atualizacaoPedidosEmAndamento = true;
  try {
    estado.dados = await api(`/api/painel/dados?_=${Date.now()}`, { cache: "no-store" });
    avisarPedidosNovos(estado.dados.pedidos);
    renderPedidos();
  } catch {
    // A verificação de sessão existente continua responsável por mostrar o
    // login se ela expirar; uma falha momentânea não deve retirar o painel.
  } finally {
    atualizacaoPedidosEmAndamento = false;
  }
}

async function validarSessaoPainel({ atualizarDados = true } = {}) {
  if (validacaoSessaoEmAndamento) return validacaoSessaoEmAndamento;

  ocultarPainelDuranteValidacao();
  validacaoSessaoEmAndamento = (async () => {
    try {
      const sessao = await api(`/api/painel/sessao?_=${Date.now()}`, { cache: "no-store" });
      if (!sessao.autenticado || sessao.perfil !== portalPainel) {
        mostrarLoginPainel();
        return false;
      }

      if ((atualizarDados && podeAtualizarDadosAutomaticamente()) || !estado.dados) await carregar();
      $("#login").classList.add("oculto");
      $("#aplicacao").classList.remove("oculto");
      return true;
    } catch {
      mostrarLoginPainel();
      return false;
    } finally {
      validacaoSessaoEmAndamento = null;
    }
  })();

  return validacaoSessaoEmAndamento;
}

validarSessaoPainel();
if (portalPainel === "atendente") {
  atualizarBotaoNotificacoes();
  $("#ativarNotificacoes")?.addEventListener("click", ativarNotificacoes);
}

window.addEventListener("pagehide", () => {
  // Impede que o histórico rápido do celular fotografe pedidos e controles.
  ocultarPainelDuranteValidacao();
});

window.addEventListener("pageshow", evento => {
  if (evento.persisted) validarSessaoPainel();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !$("#aplicacao").classList.contains("oculto")) {
    validarSessaoPainel();
  }
});
setInterval(() => { if (!$("#aplicacao").classList.contains("oculto") && podeAtualizarDadosAutomaticamente()) carregar().catch(() => {}); }, 30000);
setInterval(atualizarPedidosAutomaticamente, 10000);

// Experiência operacional em guias e estoque por disponibilidade.
estado.guia = portalPainel === "atendente" ? "pedidos" : "estoque";
estado.fase = "confirmar";
estado.modalidade = "entrega";

function aplicarRestricoesDoPortal() {
  document.querySelectorAll(".guia-principal").forEach(botao => {
    botao.hidden = !guiasPermitidas.includes(botao.dataset.guia);
  });
  document.querySelectorAll(".secao-painel").forEach(secao => {
    secao.hidden = !guiasPermitidas.includes(secao.dataset.secao);
  });
  const titulo = portalPainel === "atendente" ? "Portal do atendente" : "Portal administrativo";
  document.querySelectorAll(".marca-login small").forEach(el => { el.textContent = titulo; });
  const textoLogin = $("#login .muted");
  if (textoLogin) textoLogin.textContent = portalPainel === "atendente"
    ? "Entre com o código do atendente."
    : "Entre com o código administrativo compartilhado pelo proprietário.";
}

aplicarRestricoesDoPortal();
estado.buscaHistorico = "";
estado.modalidadeHistorico = "todos";

function valorInformado(...valores) {
  const valor = valores.find(item => item !== undefined && item !== null && String(item).trim() !== "");
  return valor === undefined ? "Não informado" : String(valor);
}

function numeroEndereco(recebimento) {
  const numero = String(recebimento?.numero || "").trim();
  return !numero || /^n[aã]o informado$/i.test(numero) ? "Sem número" : numero;
}

function formatarHorario(valor) {
  if (!valor) return "Não informado";
  if (valor === "assim_que_possivel") return "Assim que possível";
  return String(valor).replaceAll("_", " ");
}

function aplicarGuia(nome) {
  estado.guia = nome;
  document.querySelectorAll(".guia-principal").forEach(botao => botao.classList.toggle("ativa", botao.dataset.guia === nome));
  document.querySelectorAll(".secao-painel").forEach(secao => secao.classList.toggle("ativa", secao.dataset.secao === nome));
  if (nome === "pedidos") atualizarPedidosAutomaticamente();
  if (nome === "historico") renderHistorico();
}

function animarTransicaoPedido(elemento, status) {
  const cartao = elemento?.closest?.("[data-pedido-card]");
  if (!cartao || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  const rotulos = {
    em_preparo: "Indo para Em preparo",
    pronto: "Indo para Pronto",
    saiu_entrega: "Indo para o Histórico",
    concluido: "Indo para o Histórico"
  };
  cartao.dataset.transicaoTexto = rotulos[status] || "Atualizando pedido";
  cartao.classList.add("pedido-em-transicao");
  return new Promise(resolve => setTimeout(resolve, 620));
}

function nomeModalidade(modalidade) {
  return ({ entrega: "Entrega", retirada: "Retirada", salao: "Salão" })[modalidade] || "Não informada";
}

function modalidadeDoPedido(pedido) {
  const modalidade = String(pedido?.recebimento?.modalidade || "entrega")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return ["entrega", "salao", "retirada"].includes(modalidade) ? modalidade : "entrega";
}

function nomeProdutoCompleto(valor) {
  const palavrasMinusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return String(valor || "")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((palavra, indice) => {
      const normalizada = palavra.toLocaleLowerCase("pt-BR");
      if (indice > 0 && palavrasMinusculas.has(normalizada)) return normalizada;
      return normalizada.charAt(0).toLocaleUpperCase("pt-BR") + normalizada.slice(1);
    })
    .join(" ");
}

function tamanhoPizzaCompleto(valor) {
  const original = String(valor || "").trim();
  const chave = original.toLocaleLowerCase("pt-BR");
  return ({ p: "Pequena", pequena: "Pequena", m: "Média", media: "Média", média: "Média", g: "Grande", grande: "Grande", f: "Família", familia: "Família", família: "Família" })[chave] || nomeProdutoCompleto(original) || "Não informado";
}

function formatarPizzaCompleta(item) {
  const quantidade = Math.max(1, Number(item?.quantidade) || 1);
  const saboresOriginais = Array.isArray(item?.sabores) && item.sabores.length ? item.sabores : [item?.sabor];
  const sabores = saboresOriginais.filter(Boolean).map(nomeProdutoCompleto).join(" e ") || "Sabor não informado";
  const categoriaCatalogo = estado.catalogoPrecos?.categoriasProdutos?.[item?.sabor || saboresOriginais[0]];
  const categoria = item?.categoria || categoriaCatalogo || "tradicionais";
  const produto = categoria === "doces"
    ? `Combo: ${sabores}`
    : categoria === "especiais"
      ? `Acompanhamento: ${sabores}`
      : /^hambúrgueres?\b/i.test(sabores) ? sabores : `Hambúrguer de ${sabores}`;
  return `${quantidade}× ${produto}`;
}

function formatarBebidaCompleta(item) {
  const quantidade = Math.max(1, Number(item?.quantidade) || 1);
  return `${quantidade}× Bebida: ${nomeProdutoCompleto(item?.nome || item?.chave) || "Bebida não informada"}`;
}

function detalhesPagamento(pedido, recebimento) {
  const forma = String(recebimento.pagamento || recebimento.formaPagamento || pedido.pagamento || "").toLowerCase();
  const statusPagamento = String(recebimento.pagamentoStatus || pedido.pagamentoStatus || "").toLowerCase();
  const pagoOnline = Boolean(pedido.pagoEm) || statusPagamento === "approved" || pedido.status === "pago";
  const local = recebimento.modalidade === "entrega" ? "na entrega" : "no estabelecimento";
  let descricao = "Forma de pagamento não informada";
  const complementos = [];
  let confirmado = false;

  if (forma === "dinheiro") {
    descricao = `Dinheiro ${local}`;
    if (recebimento.trocoPara != null) {
      complementos.push(`Troco a levar|${moeda(recebimento.troco)}`);
    } else {
      complementos.push("Troco|Não precisa");
    }
  } else if (forma === "maquininha") {
    descricao = `Cartão ${local}`;
  } else if (forma === "pix" || recebimento.formaPagamento === "pix") {
    descricao = "PIX online";
    confirmado = pagoOnline;
  } else if (forma) {
    const tipo = recebimento.tipoCartao === "credito" || recebimento.tipoPagamento === "credit_card" ? "Crédito" : recebimento.tipoCartao === "debito" || recebimento.tipoPagamento === "debit_card" ? "Débito" : null;
    descricao = "Cartão online";
    if (tipo) complementos.push(`Tipo|${tipo}`);
    if (tipo === "Crédito") {
      const parcelas = Number(recebimento.parcelas || 1);
      complementos.push(parcelas > 1 ? `Parcelas|${parcelas}x` : "Pagamento|À vista");
    }
    confirmado = pagoOnline;
  }

  // Ao finalizar um pedido presencial, o atendimento já foi encerrado e o
  // painel deve registrar o pagamento como concluído no histórico.
  if (pedido.status === "concluido") confirmado = true;

  const pagamentoNaEntrega = recebimento.modalidade === "entrega" && ["dinheiro", "maquininha"].includes(forma);

  return {
    descricao,
    complementos,
    statusTexto: confirmado ? "Pagamento concluído" : pagamentoNaEntrega ? "Confirmar na entrega" : "Aguardando pagamento",
    statusClasse: confirmado ? "confirmado" : "aguardando",
    pago: confirmado
  };
}

function formatarDuracao(minutos) {
  const total = Math.max(0, Math.floor(Number(minutos) || 0));
  if (total < 60) return `${total} min`;

  const horas = Math.floor(total / 60);
  const restante = total % 60;
  return restante ? `${horas} h ${restante} min` : `${horas} h`;
}

function tempoDaEtapa(pedido) {
  const configuracoes = {
    pago: { limiteMinutos: 5, alerta: "Pedido aguardando confirmação há mais de 5 min" },
    confirmado: { limiteMinutos: 5, alerta: "Pedido confirmado aguardando preparo há mais de 5 min" },
    confirmado_pagamento_local: { limiteMinutos: 5, alerta: "Pedido aguardando início do preparo há mais de 5 min" },
    em_preparo: { limiteMinutos: 15, alerta: "Preparo ultrapassou 15 min" },
    pronto: { limiteMinutos: 30, alerta: "Pedido pronto aguardando saída há mais de 30 min" },
    compartilhado: { limiteMinutos: 30, alerta: "Pedido pronto aguardando saída há mais de 30 min" }
  };
  const configuracao = configuracoes[pedido.status];
  if (!configuracao) return null;
  const inicio = pedido.status === "pago"
    ? pedido.pagoEm || pedido.atualizadoEm || pedido.criadoEm
    : pedido.status === "confirmado" || pedido.status === "confirmado_pagamento_local"
      ? pedido.confirmadoEm || pedido.atualizadoEm || pedido.pagoEm || pedido.criadoEm
      : pedido.atualizadoEm || pedido.criadoEm;
  const dataInicio = new Date(inicio || Date.now());
  const minutosReais = Math.max(0, Math.floor((Date.now() - dataInicio.getTime()) / 60000));
  const minutosExibidos = minutosReais < 3 ? 1 : Math.floor(minutosReais / 3) * 3;
  return {
    texto: formatarDuracao(minutosExibidos),
    emAlerta: minutosReais > configuracao.limiteMinutos,
    alerta: configuracao.alerta
  };
}

renderPedidos = function renderPedidosEmGuias() {
  let pedidos = [...estado.dados.pedidos];
  const grupos = {
    confirmar: ["pago", "confirmado", "confirmado_pagamento_local"],
    em_preparo: ["em_preparo"],
    pronto: ["pronto", "compartilhado"],
    concluido: ["saiu_entrega", "concluido"]
  };
  // Pedidos que ainda estão no checkout não têm modalidade definitiva. Eles só
  // entram nos avisos do painel depois do pagamento/confirmação.
  const statusOperacionais = new Set([
    ...grupos.confirmar,
    ...grupos.em_preparo,
    ...grupos.pronto
  ]);
  document.querySelectorAll("[data-contador]").forEach(contador => {
    const quantidade = estado.dados.pedidos.filter(pedido =>
      // Não contamos carrinhos ainda aguardando pagamento, pois o cliente pode
      // mudar Entrega/Salão/Retirada antes da confirmação.
      statusOperacionais.has(pedido.status) &&
      (contador.dataset.contador === "geral" ||
        modalidadeDoPedido(pedido) === contador.dataset.contador)
    ).length;
    contador.textContent = String(quantidade);
    contador.hidden = quantidade === 0;
    contador.parentElement?.classList.toggle("tem-pedidos", quantidade > 0);
  });
  document.querySelectorAll("[data-contador-fase]").forEach(contador => {
    const fase = contador.dataset.contadorFase;
    const quantidade = estado.dados.pedidos.filter(pedido =>
      statusOperacionais.has(pedido.status) &&
      (grupos[fase] || []).includes(pedido.status) &&
      modalidadeDoPedido(pedido) === estado.modalidade
    ).length;
    contador.textContent = String(quantidade);
    contador.hidden = quantidade === 0;
    contador.parentElement?.classList.toggle("tem-pedidos", quantidade > 0);
  });
  pedidos = pedidos.filter(pedido => (grupos[estado.fase] || grupos.confirmar).includes(pedido.status));
  pedidos = pedidos.filter(pedido => modalidadeDoPedido(pedido) === estado.modalidade);

  $("#pedidos").innerHTML = pedidos.length ? pedidos.map(p => {
    const pizzas = (p.pizzas || []).map(formatarPizzaCompleta);
    const bebidas = (p.bebidas || []).map(formatarBebidaCompleta);
    const rec = p.recebimento || {};
    const modalidade = modalidadeDoPedido(p);
    const entrega = modalidade === "entrega";
    const retirada = modalidade === "retirada";
    const observacao = valorInformado(p.observacaoPizzas, p.observacao, rec.observacao);
    const pagamento = detalhesPagamento(p, rec);
    const tempo = tempoDaEtapa(p);
    const localRecebimento = entrega
      ? `${valorInformado(rec.rua)}, ${numeroEndereco(rec)} — ${valorInformado(rec.bairro)}, ${valorInformado(rec.cidade)}-${valorInformado(rec.estado)}`
      : retirada ? "Retirada no estabelecimento" : "Consumir no salão";
    const acaoPronto = entrega
      ? `<div class="acoes-confirmacao acoes-envio"><button class="btn-envio endereco" data-enviar-motoboy="${escapar(p.id)}" data-canal-envio="endereco">📍 Ver endereço</button><button class="btn-envio whatsapp" data-enviar-motoboy="${escapar(p.id)}" data-canal-envio="whatsapp">↗ Enviar por WhatsApp</button><button class="btn-envio gmail" data-enviar-motoboy="${escapar(p.id)}" data-canal-envio="gmail">✉ E-mail</button><button class="btn-envio gmail" data-enviar-motoboy="${escapar(p.id)}" data-canal-envio="email_web">🌐 E-mail Web</button><button class="btn-envio marcar" data-enviar-motoboy="${escapar(p.id)}" data-canal-envio="marcar">✓ Marcar como enviado</button></div>`
      : `<button class="btn-etapa" data-status-pedido="concluido" data-id="${escapar(p.id)}">${retirada ? "Pedido retirado" : "Concluir atendimento"}</button>`;

    return `<article class="pedido ${p.demonstracao ? "pedido-demonstracao" : ""} ${tempo?.emAlerta ? "pedido-em-alerta" : ""}" data-pedido-card="${escapar(p.id)}">
      <div class="pedido-topo"><div><div class="pedido-id">#${escapar(p.id)}</div><div class="pedido-data">${new Date(p.criadoEm || rec.criadoEm || Date.now()).toLocaleString("pt-BR")}</div></div><div class="pedido-indicadores"><span class="tempo-etapa ${tempo?.emAlerta ? "alerta" : ""}">⏱ ${escapar(tempo?.texto || "")}</span><span class="badge ${p.status}">${textoStatus(p.status)}</span></div></div>
      ${tempo?.emAlerta ? `<div class="alerta-tempo">⚠️ ${escapar(tempo.alerta)}</div>` : ""}
      <div class="itens"><strong>Itens do pedido</strong><br>${[...pizzas, ...bebidas].map(escapar).join("<br>") || "Itens não informados"}</div>
      ${observacao !== "Não informado" ? `<div class="observacao-destaque"><strong>Observação do cliente</strong><br>${escapar(observacao)}</div>` : ""}
      <div class="pedido-detalhes">
        <div class="detalhe"><span>CLIENTE</span><strong>${escapar(valorInformado(rec.nome, p.nomeCliente, p.cliente))}</strong></div>
        <div class="detalhe"><span>CONTATO</span><strong>${escapar(valorInformado(rec.contato, p.contato, p.cliente))}</strong></div>
        <div class="detalhe"><span>MODALIDADE</span><strong>${escapar(nomeModalidade(modalidade))}</strong></div>
        ${!entrega ? `<div class="detalhe"><span>HORÁRIO</span><strong>${escapar(formatarHorario(rec.horario))}</strong></div>` : ""}
        <div class="detalhe largo"><span>${entrega ? "ENDEREÇO" : "RECEBIMENTO"}</span><strong>${escapar(localRecebimento)}</strong></div>
        ${entrega ? `<div class="detalhe"><span>COMPLEMENTO</span><strong>${escapar(valorInformado(rec.complemento))}</strong></div><div class="detalhe"><span>REFERÊNCIA</span><strong>${escapar(valorInformado(rec.referencia))}</strong></div><div class="detalhe"><span>CEP</span><strong>${escapar(valorInformado(rec.cep))}</strong></div><div class="detalhe"><span>TAXA DE ENTREGA</span><strong>${moeda(rec.taxaEntrega)}</strong></div>` : ""}
        ${modalidade === "salao" ? `<div class="detalhe"><span>PESSOAS</span><strong>${escapar(rec.quantidadePessoas || 1)}</strong></div>` : ""}
        <div class="detalhe largo pagamento-detalhe">
          <div class="pagamento-cabecalho"><span>PAGAMENTO</span><b class="pagamento-status ${pagamento.statusClasse}">${escapar(pagamento.statusTexto)}</b></div>
          <div class="pagamento-forma"><i aria-hidden="true">${pagamento.descricao.includes("Dinheiro") ? "💵" : pagamento.descricao.includes("PIX") ? "◆" : "💳"}</i><strong>${escapar(pagamento.descricao)}</strong></div>
          ${pagamento.complementos.length ? `<div class="pagamento-complementos">${pagamento.complementos.map(item => { const [rotulo, ...partes] = String(item).split("|"); return `<div><span>${escapar(rotulo)}</span><strong>${escapar(partes.join("|") || rotulo)}</strong></div>`; }).join("")}</div>` : ""}
        </div>
        <div class="detalhe"><span>TOTAL</span><strong>${moeda(rec.totalFinal ?? p.total)}</strong></div>
      </div>
      ${["pago","confirmado","confirmado_pagamento_local"].includes(p.status) ? `<div class="acoes-confirmacao"><button class="btn-etapa" data-status-pedido="em_preparo" data-id="${escapar(p.id)}">Iniciar pedido</button><button class="btn-recusar" data-recusar-pedido="${escapar(p.id)}">Recusar pedido</button></div>` : ""}
      ${p.status === "em_preparo" ? `<button class="btn-etapa" data-status-pedido="pronto" data-id="${escapar(p.id)}">Pronto</button>` : ""}
      ${["pronto","compartilhado"].includes(p.status) ? acaoPronto : ""}
    </article>`;
  }).join("") : `<div class="vazio">Nenhum pedido nesta etapa.</div>`;
};
function nomeEstoquePadronizado(tipo, nome) {
  const prefixos = { pizzas: "Hambúrguer", acompanhamentos: "Acompanhamento", combos: "Combo", bebidas: "Bebida" };
  const variantes = { pizzas: "hamb[úu]rguer", acompanhamentos: "acompanhamento", combos: "combo", bebidas: "bebida" };
  let base = String(nome || "").replaceAll("_", " ").trim();
  const removerPrefixo = new RegExp(`^${variantes[tipo]}(?:\\s+de|\\s*:)?\\s*`, "i");
  while (removerPrefixo.test(base)) base = base.replace(removerPrefixo, "").trim();
  return `${prefixos[tipo]}: ${base || "Sem nome"}`;
}

renderEstoque = function renderEstoqueDisponibilidade() {
  const tipos = estado.tipoEstoque === "todos" ? ["pizzas", "acompanhamentos", "combos", "bebidas"] : [estado.tipoEstoque];
  const rotulos = { pizzas: "Hambúrguer", acompanhamentos: "Acompanhamento", combos: "Combo", bebidas: "Bebida" };
  const busca = normalizarBuscaPainel(estado.busca);
  const produtos = tipos.flatMap(tipo => Object.entries(estado.dados.estoque[tipo] || {}).map(([nome, quantidade]) => ({ tipo, nome, quantidade }))).filter(item => normalizarBuscaPainel(`${item.nome} ${rotulos[item.tipo]}`).includes(busca));
  $("#estoque").innerHTML = produtos.map(({tipo, nome, quantidade}) => {
    const disponivel = Number(quantidade) > 0;
    return `<div class="produto ${disponivel ? "disponivel" : "esgotado"}"><div><div class="produto-nome">${escapar(nomeEstoquePadronizado(tipo, nome))}</div><small class="estado-produto ${disponivel ? "ok" : "off"}">${disponivel ? "Disponível" : "Esgotado"}</small></div><div class="quantidade"><button data-disponibilidade="esgotar" data-tipo="${tipo}" data-chave="${escapar(nome)}" title="Marcar como esgotado">−</button><button data-disponibilidade="liberar" data-tipo="${tipo}" data-chave="${escapar(nome)}" title="Voltar a disponibilizar">+</button></div></div>`;
  }).join("") || '<div class="vazio">Nenhum produto encontrado.</div>';
};

document.querySelectorAll(".guia-principal").forEach(botao => botao.addEventListener("click", () => aplicarGuia(botao.dataset.guia)));
document.querySelector("#abrirAjudaRapida")?.addEventListener("click", () => aplicarGuia("ajuda"));
document.querySelectorAll(".subguia").forEach(botao => botao.addEventListener("click", () => {
  estado.fase = botao.dataset.fase;
  document.querySelectorAll(".subguia").forEach(item => item.classList.toggle("ativa", item === botao));
  renderPedidos();
}));
document.querySelectorAll(".modalidade-pedido").forEach(botao => botao.addEventListener("click", () => {
  estado.modalidade = botao.dataset.modalidade;
  estado.fase = "confirmar";
  document.querySelectorAll(".modalidade-pedido").forEach(item => item.classList.toggle("ativa", item === botao));
  document.querySelectorAll(".subguia").forEach(item => item.classList.toggle("ativa", item.dataset.fase === "confirmar"));
  const card = document.querySelector(".pedidos-card");
  if (card) card.dataset.modalidadeAtual = estado.modalidade;
  renderPedidos();
}));

document.addEventListener("click", async evento => {
  const botao = evento.target.closest("[data-disponibilidade]");
  if (!botao) return;
  evento.preventDefault();
  evento.stopImmediatePropagation();
  try {
    const identificador = `${botao.dataset.tipo}|${botao.dataset.chave}`;
    const agora = Date.now();
    if (botao.dataset.disponibilidade === "esgotar" && window.ultimoCliqueMenosEstoque?.id === identificador && agora - window.ultimoCliqueMenosEstoque.tempo < 700) {
      window.ultimoCliqueMenosEstoque = null;
      if (!confirm("Excluir este item do estoque e do cardápio? Esta ação não pode ser desfeita.")) return;
      await api("/api/painel/catalogo/item", { method: "DELETE", body: JSON.stringify({ tipo: botao.dataset.tipo, chave: botao.dataset.chave }) });
      await carregar();
      toast("Item excluído do estoque e do cardápio.");
      return;
    }
    window.ultimoCliqueMenosEstoque = { id: identificador, tempo: agora };
    const quantidade = botao.dataset.disponibilidade === "esgotar" ? 0 : 10000;
    await atualizarEstoque(botao.dataset.tipo, botao.dataset.chave, quantidade);
    toast(quantidade ? "Produto disponível novamente." : "Produto marcado como esgotado.");
  } catch (erro) { toast(erro.message); }
}, true);

const renderOriginal = render;
render = function renderComGuias() {
  renderOriginal();
  const horario = estado.dados?.horario || {};
  const horarioEl = $("#horarioBot");
  if (horarioEl) {
    horarioEl.textContent = horario.abertura && horario.fechamento
      ? `${horario.abertura} às ${horario.fechamento} · ${horario.fuso}`
      : `24 horas · ${horario.fuso || "America/Fortaleza"}`;
  }
  const funcionando = Boolean(estado.dados?.botFuncionando);
  $("#estadoGeral").innerHTML = `<i></i> ${funcionando ? "Bot funcionando agora" : "Bot parado agora"}`;
  $("#resumo").innerHTML = "";
  aplicarGuia(estado.guia);
  renderHistorico();
};
aplicarGuia("pedidos");

function tempoNoHistorico(pedido) {
  const inicio = new Date(pedido.atualizadoEm || pedido.criadoEm || Date.now()).getTime();
  const minutos = Math.max(0, Math.floor((Date.now() - inicio) / 60000));
  return minutos < 1 ? "Agora" : `${minutos} min no Histórico`;
}

function renderHistorico() {
  const destino = $("#historicoPedidos");
  if (!destino || !estado.dados) return;
  let pedidos = estado.dados.pedidos.filter(pedido => ["saiu_entrega", "concluido", "cancelado"].includes(pedido.status));
  if (estado.modalidadeHistorico !== "todos") {
    pedidos = pedidos.filter(pedido => (pedido.recebimento?.modalidade || "entrega") === estado.modalidadeHistorico);
  }
  if (estado.buscaHistorico) {
    pedidos = pedidos.filter(pedido => String(pedido.id).toLowerCase().includes(estado.buscaHistorico));
  }
  pedidos.sort((a, b) => new Date(b.atualizadoEm || b.criadoEm || 0) - new Date(a.atualizadoEm || a.criadoEm || 0));
  destino.innerHTML = pedidos.length ? pedidos.map(pedido => {
    const rec = pedido.recebimento || {};
    const modalidade = rec.modalidade || "entrega";
    const entrega = modalidade === "entrega";
    const retirada = modalidade === "retirada";
    const pagamento = detalhesPagamento(pedido, rec);
    const observacao = valorInformado(pedido.observacaoPizzas, pedido.observacao, rec.observacao);
    const itens = [
      ...(pedido.pizzas || []).map(formatarPizzaCompleta),
      ...(pedido.bebidas || []).map(formatarBebidaCompleta)
    ];
    const recebimento = entrega
      ? `${valorInformado(rec.rua)}, ${numeroEndereco(rec)} — ${valorInformado(rec.bairro)}, ${valorInformado(rec.cidade)}-${valorInformado(rec.estado)}`
      : retirada ? "Retirada no estabelecimento" : "Consumir no salão";
    return `<article class="pedido historico-item modalidade-${modalidade} ${pedido.status === "cancelado" ? "historico-recusado" : ""}">
      <div class="pedido-topo">
        <div><div class="pedido-id">#${escapar(pedido.id)}</div><div class="pedido-data">${new Date(pedido.atualizadoEm || pedido.criadoEm || Date.now()).toLocaleString("pt-BR")}</div></div>
        <div class="pedido-indicadores"><span class="tempo-etapa">${escapar(tempoNoHistorico(pedido))}</span><span class="badge ${pedido.status}">${escapar(textoStatus(pedido.status))}</span><span class="modalidade-selo ${modalidade}">${escapar(nomeModalidade(modalidade))}</span></div>
      </div>
      <div class="itens"><strong>Itens do pedido</strong><br>${itens.map(escapar).join("<br>") || "Itens não informados"}</div>
      ${observacao !== "Não informado" ? `<div class="observacao-destaque"><strong>Observação do cliente</strong><br>${escapar(observacao)}</div>` : ""}
      <div class="pedido-detalhes">
        <div class="detalhe"><span>CLIENTE</span><strong>${escapar(valorInformado(rec.nome, pedido.nomeCliente, pedido.cliente))}</strong></div>
        <div class="detalhe"><span>CONTATO</span><strong>${escapar(valorInformado(rec.contato, pedido.contato, pedido.cliente))}</strong></div>
        <div class="detalhe"><span>MODALIDADE</span><strong>${escapar(nomeModalidade(modalidade))}</strong></div>
        ${!entrega ? `<div class="detalhe"><span>HORÁRIO</span><strong>${escapar(formatarHorario(rec.horario))}</strong></div>` : ""}
        <div class="detalhe largo"><span>${entrega ? "ENDEREÇO" : "RECEBIMENTO"}</span><strong>${escapar(recebimento)}</strong></div>
        ${entrega ? `<div class="detalhe"><span>COMPLEMENTO</span><strong>${escapar(valorInformado(rec.complemento))}</strong></div><div class="detalhe"><span>REFERÊNCIA</span><strong>${escapar(valorInformado(rec.referencia))}</strong></div><div class="detalhe"><span>CEP</span><strong>${escapar(valorInformado(rec.cep))}</strong></div><div class="detalhe"><span>TAXA DE ENTREGA</span><strong>${moeda(rec.taxaEntrega)}</strong></div>` : ""}
        ${modalidade === "salao" ? `<div class="detalhe"><span>PESSOAS</span><strong>${escapar(rec.quantidadePessoas || 1)}</strong></div>` : ""}
        <div class="detalhe largo pagamento-detalhe">
          <div class="pagamento-cabecalho"><span>PAGAMENTO</span><b class="pagamento-status ${pagamento.statusClasse}">${escapar(pagamento.statusTexto)}</b></div>
          <div class="pagamento-forma"><i aria-hidden="true">${pagamento.descricao.includes("Dinheiro") ? "💵" : pagamento.descricao.includes("PIX") ? "◆" : "💳"}</i><strong>${escapar(pagamento.descricao)}</strong></div>
          ${pagamento.complementos.length ? `<div class="pagamento-complementos">${pagamento.complementos.map(item => { const [rotulo, ...partes] = String(item).split("|"); return `<div><span>${escapar(rotulo)}</span><strong>${escapar(partes.join("|") || rotulo)}</strong></div>`; }).join("")}</div>` : ""}
        </div>
        <div class="detalhe largo"><span>TOTAL</span><strong>${moeda(rec.totalFinal ?? pedido.total)}</strong></div>
      </div>
      ${entrega && pedido.status !== "cancelado" ? `<div class="acoes-confirmacao acoes-historico"><button class="btn-envio endereco" data-enviar-motoboy="${escapar(pedido.id)}" data-canal-envio="endereco">📍 Ver endereço</button><button class="btn-envio whatsapp" data-enviar-motoboy="${escapar(pedido.id)}" data-canal-envio="whatsapp">↗ WhatsApp</button><button class="btn-envio gmail" data-enviar-motoboy="${escapar(pedido.id)}" data-canal-envio="gmail">✉ E-mail</button><button class="btn-envio gmail" data-enviar-motoboy="${escapar(pedido.id)}" data-canal-envio="email_web">🌐 E-mail Web</button></div>` : ""}
    </article>`;
  }).join("") : `<div class="vazio">Nenhum pedido no Histórico.</div>`;
}

$("#buscarHistorico").addEventListener("input", evento => {
  estado.buscaHistorico = evento.target.value.toLowerCase().trim().replace(/^#/, "");
  renderHistorico();
});
document.querySelectorAll("[data-historico-modalidade]").forEach(botao => botao.addEventListener("click", () => {
  estado.modalidadeHistorico = botao.dataset.historicoModalidade;
  document.querySelectorAll("[data-historico-modalidade]").forEach(item => item.classList.toggle("ativo", item === botao));
  renderHistorico();
}));
function dadosFicha(pedido) {
  const rec = pedido.recebimento || {};
  const pagamento = detalhesPagamento(pedido, rec);
  const detalhesFinanceiros = (pagamento.complementos || [])
    .map(item => String(item).replace("|", ": "));
  return { id: pedido.id, linhas: [
    "ITENS DO PEDIDO",
    ...(pedido.pizzas || []).map(formatarPizzaCompleta),
    ...(pedido.bebidas || []).map(formatarBebidaCompleta),
    "",
    `STATUS DO PAGAMENTO: ${pagamento.statusTexto}`,
    `FORMA DE PAGAMENTO: ${pagamento.descricao}`,
    ...detalhesFinanceiros,
    "",
    `CLIENTE: ${valorInformado(rec.nome, pedido.nomeCliente, pedido.cliente)}`,
    `CONTATO: ${valorInformado(rec.contato, pedido.contato, pedido.cliente)}`,
    "",
    `ENDEREÇO: ${valorInformado(rec.rua)}, ${numeroEndereco(rec)} - ${valorInformado(rec.bairro)}`,
    `COMPLEMENTO: ${valorInformado(rec.complemento)}`,
    `REFERÊNCIA: ${valorInformado(rec.referencia)}`,
    `CIDADE/CEP: ${valorInformado(rec.cidade)}/${valorInformado(rec.estado)} - ${valorInformado(rec.cep)}`,
    "",
    `OBSERVAÇÃO: ${valorInformado(pedido.observacaoPizzas, pedido.observacao, rec.observacao)}`,
    `TOTAL: ${moeda(rec.totalFinal ?? pedido.total)}`
  ] };
}

function rotaDoMotoboy(pedido) {
  const recebimento = pedido.recebimento || {};
  const entrega = estado.dados?.configuracao?.entrega || {};
  const latitude = Number(entrega.latitudePizzaria);
  const longitude = Number(entrega.longitudePizzaria);
  const origem = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? latitude + "," + longitude
    : String(entrega.enderecoPizzaria || "").trim();
  const destino = [
    recebimento.rua,
    numeroEndereco(recebimento),
    recebimento.bairro,
    recebimento.cidade,
    recebimento.estado,
    recebimento.cep
  ].filter(valor => String(valor || "").trim()).join(", ");
  if (!origem || !destino) return "";
  const parametros = new URLSearchParams({
    api: "1",
    origin: origem,
    destination: destino,
    travelmode: "driving",
    dir_action: "navigate"
  });
  return "https://www.google.com/maps/dir/?" + parametros.toString();
}

function textoRotaMotoboy(pedido, rota) {
  return "🛵 Rota de entrega do pedido #" + pedido.id +
    "\nAbra no Google Maps para seguir a rota sugerida:" +
    "\n" + rota;
}

async function criarFichaMotoboy(pedido) {
  const dados = dadosFicha(pedido), canvas = document.createElement("canvas"), contexto = canvas.getContext("2d"), largura = 1080, margem = 64;
  contexto.font = "600 30px Arial";
  const texto = dados.linhas.flatMap(linha => { const partes = String(linha).split(" "), resultado = []; let atual = ""; partes.forEach(parte => { const teste = atual ? `${atual} ${parte}` : parte; if (atual && contexto.measureText(teste).width > largura - margem * 2) { resultado.push(atual); atual = parte; } else atual = teste; }); if (atual) resultado.push(atual); return resultado; });
  canvas.width = largura; canvas.height = 240 + texto.length * 48 + 70;
  contexto.fillStyle = "#f3f6f4"; contexto.fillRect(0, 0, largura, canvas.height); contexto.fillStyle = "#12251d"; contexto.fillRect(0, 0, largura, 180); contexto.fillStyle = "#fff"; contexto.font = "bold 34px Arial"; contexto.fillText("PEDIDO PARA ENTREGA", margem, 68); contexto.font = "bold 60px Arial"; contexto.fillText(`#${dados.id}`, margem, 138);
  let y = 235; contexto.fillStyle = "#17211d"; contexto.font = "600 30px Arial"; texto.forEach(linha => { if (linha === "") { y += 22; return; } contexto.fillStyle = /^(ITENS DO PEDIDO|STATUS DO PAGAMENTO|FORMA DE PAGAMENTO|PAGAMENTO|PARCELAS|CLIENTE|CONTATO|ENDEREÇO|COMPLEMENTO|REFERÊNCIA|CIDADE\/CEP|OBSERVAÇÃO|TOTAL)(:|$)/.test(linha) ? "#117546" : "#17211d"; contexto.fillText(linha, margem, y); y += 48; });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png")); if (!blob) throw new Error("Não foi possível gerar a ficha."); return new File([blob], `pedido-${dados.id}.png`, { type: "image/png" });
}
function baixarFicha(arquivo) { const url = URL.createObjectURL(arquivo), link = document.createElement("a"); link.href = url; link.download = arquivo.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function abrirWhatsAppDireto(texto) {
  const mensagem = encodeURIComponent(texto);
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (celular) {
    // Abre o aplicativo instalado (inclusive WhatsApp Business) sem passar por
    // uma página intermediária do navegador. O fallback mantém compatibilidade.
    window.location.href = `whatsapp://send?text=${mensagem}`;
    setTimeout(() => {
      if (document.visibilityState === "visible") window.location.href = `https://api.whatsapp.com/send?text=${mensagem}`;
    }, 1200);
    return;
  }
  window.open(`https://api.whatsapp.com/send?text=${mensagem}`, "_blank", "noopener");
}

function abrirEmailWeb(assunto, texto) {
  const params = new URLSearchParams({ view: "cm", fs: "1", su: assunto, body: texto });
  window.open(`https://mail.google.com/mail/?${params.toString()}`, "_blank", "noopener");
}

async function compartilharFichaNoCelular(ficha, texto, titulo) {
  const podeCompartilhar = navigator.share && (!navigator.canShare || navigator.canShare({ files: [ficha] }));
  if (!podeCompartilhar) return false;
  await navigator.share({ files: [ficha], title: titulo, text: texto });
  return true;
}

async function prepararFichaNoComputador(ficha) {
  // Sites não recebem autorização para anexar em WhatsApp/Gmail, mas os dois
  // aceitam uma imagem copiada pelo operador com Ctrl+V.
  let copiada = false;
  try {
    copiada = await copiarFichaParaAreaTransferencia(ficha);
  } catch (_) {
    copiada = false;
  }
  baixarFicha(ficha);
  return copiada;
}

async function criarLinkFichaEntrega(pedido) {
  const resposta = await fetch("/api/painel/ficha-entrega", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(dadosFicha(pedido))
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.url) throw new Error(dados.erro || "Não foi possível criar o link da ficha.");
  return dados.url;
}

async function copiarFichaParaAreaTransferencia(arquivo) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  await navigator.clipboard.write([new ClipboardItem({ [arquivo.type]: arquivo })]);
  return true;
}

function exibirFichaAntesDoEnvio(arquivo, pedido) {
  const anterior = document.querySelector(".preview-ficha-overlay");
  if (anterior) anterior.remove();
  const url = URL.createObjectURL(arquivo);
  const tela = document.createElement("div");
  tela.className = "preview-ficha-overlay";
  tela.innerHTML = `<section class="preview-ficha" role="dialog" aria-modal="true" aria-label="Ficha do pedido #${escapar(pedido.id)}"><button class="fechar-preview-ficha" type="button" aria-label="Fechar prévia">×</button><p>FICHA PARA ENVIO</p><h2>Pedido #${escapar(pedido.id)}</h2><img src="${url}" alt="Ficha com as informações do pedido #${escapar(pedido.id)}"><div><button class="copiar-preview-ficha" type="button">Copiar imagem</button><a class="baixar-preview-ficha" href="${url}" download="${escapar(arquivo.name)}">Baixar imagem</a><small>No WhatsApp do computador, abra a conversa do motoboy e pressione Ctrl+V para colar a ficha.</small></div></section>`;
  const fechar = () => { URL.revokeObjectURL(url); tela.remove(); };
  tela.querySelector(".fechar-preview-ficha").addEventListener("click", fechar);
  tela.querySelector(".copiar-preview-ficha").addEventListener("click", async evento => {
    try {
      await copiarFichaParaAreaTransferencia(arquivo);
      evento.currentTarget.textContent = "Imagem copiada ✓";
    } catch {
      toast("Não foi possível copiar. Use o botão Baixar imagem para anexar o arquivo.");
    }
  });
  tela.addEventListener("click", evento => { if (evento.target === tela) fechar(); });
  document.body.append(tela);
}

document.addEventListener("click", async evento => {
  const botao = evento.target.closest("[data-enviar-motoboy]");
  if (!botao) return;
  evento.preventDefault();
  evento.stopImmediatePropagation();
  const pedido = estado.dados.pedidos.find(item => String(item.id) === botao.dataset.enviarMotoboy);
  if (!pedido) return toast("Pedido não encontrado.");
  if (pedido.recebimento?.modalidade !== "entrega") return toast("Somente pedidos para entrega podem ser enviadas ao motoboy.");

  const canal = botao.dataset.canalEnvio || "compartilhar";
  const rota = rotaDoMotoboy(pedido);
  const texto = rota ? textoRotaMotoboy(pedido, rota) : "🛵 Pedido #" + pedido.id + " para entrega.";

  try {
    botao.disabled = true;
    if (canal === "endereco") {
      botao.textContent = "Gerando imagem...";
      const ficha = await criarFichaMotoboy(pedido);
      exibirFichaAntesDoEnvio(ficha, pedido);
      toast("Imagem com o endereço aberta.");
      return;
    }
    if (canal === "whatsapp" || canal === "gmail" || canal === "email_web") {
      botao.textContent = "Gerando imagem...";
      const ficha = await criarFichaMotoboy(pedido);
      const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const assunto = "Pedido #" + pedido.id + " para entrega";
      // "E-mail Web" sempre abre o Gmail no navegador. Os outros botões no
      // celular usam o compartilhamento nativo para preservar o anexo.
      if (celular && canal !== "email_web") {
        try {
          if (await compartilharFichaNoCelular(ficha, texto, assunto)) {
            toast("Escolha WhatsApp ou E-mail no compartilhamento: a imagem já será anexada.");
            return;
          }
        } catch (erroCompartilhamento) {
          if (erroCompartilhamento.name === "AbortError") return;
        }
      }
      let textoComputador = texto;
      let instrucaoAnexo = "";
      try {
        const linkFicha = await criarLinkFichaEntrega(pedido);
        textoComputador += "\n\n🧾 Ficha do pedido:\n" + linkFicha;
        instrucaoAnexo = " A mensagem já inclui o link da ficha.";
      } catch (_) {
        const fichaCopiada = await prepararFichaNoComputador(ficha);
        instrucaoAnexo = fichaCopiada
          ? " A imagem também foi copiada: clique na mensagem e use Ctrl+V para anexá-la."
          : " A imagem foi baixada: anexe o arquivo pedido-" + pedido.id + ".png na mensagem.";
      }
      if (canal === "whatsapp") {
        abrirWhatsAppDireto(textoComputador);
        toast("WhatsApp aberto." + instrucaoAnexo);
      } else if (canal === "gmail") {
        window.location.href = "mailto:?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(textoComputador);
        toast("E-mail aberto." + instrucaoAnexo);
      } else {
        abrirEmailWeb(assunto, textoComputador);
        toast("Gmail Web aberto." + instrucaoAnexo);
      }
    } else if (canal === "compartilhar") {
      botao.textContent = "Preparando ficha...";
      const ficha = await criarFichaMotoboy(pedido);
      const podeCompartilhar = navigator.share && (!navigator.canShare || navigator.canShare({ files: [ficha] }));
      if (podeCompartilhar) {
        try {
          await navigator.share({ files: [ficha], title: "Pedido #" + pedido.id, text: texto });
        } catch (erroCompartilhamento) {
          if (erroCompartilhamento.name === "AbortError") {
            toast("Compartilhamento cancelado.");
            return;
          }
          throw erroCompartilhamento;
        }
      } else {
        const continuar = window.confirm(rota ? "Abrir a rota no Google Maps e baixar a ficha do pedido?" : "Baixar a ficha do pedido?");
        if (!continuar) return;
        if (rota) window.open(rota, "_blank", "noopener");
        baixarFicha(ficha);
      }
    }

    // Abrir WhatsApp/Gmail não confirma envio: somente a opção explícita
    // "Marcar como enviado" move o pedido e avisa o cliente.
    if (canal === "marcar" && pedido.status !== "saiu_entrega") {
      const resultadoStatus = await api("/api/painel/pedidos/" + encodeURIComponent(pedido.id) + "/status", { method: "PATCH", body: JSON.stringify({ status: "saiu_entrega" }) });
      if (!resultadoStatus.notificacao?.enviada) throw new Error("A ação foi realizada, mas não foi possível avisar o cliente.");
      await animarTransicaoPedido(botao, "saiu_entrega");
      await carregar();
      toast(canal === "marcar" ? "Pedido marcado como enviado, cliente avisado e registrado no Histórico." : "Pedido enviado, cliente avisado e registrado no Histórico.");
    } else if (canal === "marcar") {
      toast("Pedido reenviado.");
    }
  } catch (erro) {
    if (erro.name !== "AbortError") toast(erro.message);
  } finally {
    botao.disabled = false;
    botao.textContent = canal === "compartilhar" ? (pedido.status === "saiu_entrega" ? "Reenviar" : "Compartilhar") : canal === "endereco" ? "📍 Ver endereço" : canal === "whatsapp" ? "WhatsApp" : canal === "gmail" ? "E-mail" : canal === "email_web" ? "🌐 E-mail Web" : "Marcar como enviado";
  }
}, true);
document.addEventListener("click", async evento => {
  const recusar = evento.target.closest("[data-recusar-pedido]");
  if (recusar) {
    evento.preventDefault();
    evento.stopImmediatePropagation();
    const pedidoId = recusar.dataset.recusarPedido;
    const confirmado = window.confirm(`Deseja realmente recusar/cancelar o pedido #${pedidoId}? Esta ação não pode ser desfeita.`);
    if (!confirmado) return;
    try {
      const resultado = await api(`/api/painel/pedidos/${encodeURIComponent(pedidoId)}/status`, { method: "PATCH", body: JSON.stringify({ status: "cancelado" }) });
      await carregar();
      toast(resultado.notificacao?.enviada ? "Pedido cancelado e cliente avisado." : "Pedido cancelado.");
    } catch (erro) { toast(erro.message); }
    return;
  }
  const botao = evento.target.closest("[data-status-pedido]");
  if (!botao) return;
  evento.preventDefault();
  evento.stopImmediatePropagation();
  try {
    const novoStatus = botao.dataset.statusPedido;
    botao.disabled = true;
    const resultado = await api(`/api/painel/pedidos/${encodeURIComponent(botao.dataset.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: novoStatus }) });
    await animarTransicaoPedido(botao, novoStatus);
    await carregar();
    toast(resultado.notificacao?.enviada ? "Pedido movido e cliente avisado." : "Pedido movido para a próxima etapa.");
  } catch (erro) {
    toast(erro.message);
  } finally {
    if (botao.isConnected) botao.disabled = false;
  }
}, true);


// Preços e promoções: alterações de preço só são gravadas ao clicar em Salvar.
estado.catalogoPrecoAtual="pizzas";
estado.alteracoesPrecos={};
const chavePreco=(tipo,chave,tamanho="")=>`${tipo}|${chave}|${tamanho}`;
function nomePizzaPainel(nome){const sabor=String(nome||"").trim(),categoria=estado.catalogoPrecos?.categoriasProdutos?.[sabor];if(categoria==="especiais"||categoria==="doces")return sabor;return /^hambúrguer\s+de\s+/i.test(sabor)?sabor:`Hambúrguer de ${sabor}`}
function normalizarBuscaPainel(texto){return String(texto||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[_-]+/g," ").replace(/\s+/g," ").trim()}
function chaveEstoquePizza(nome){return String(nome||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function dadosProdutosPromocao(){const c=estado.catalogoPrecos||{},estoque=estado.dados?.estoque||{},p=[],tipoEstoque=nome=>c.categoriasProdutos?.[nome]==="especiais"?"acompanhamentos":c.categoriasProdutos?.[nome]==="doces"?"combos":"pizzas";Object.entries(c.pizzas||{}).forEach(([nome,tamanhos])=>Object.entries(tamanhos).forEach(([tamanho,preco])=>{const tipo=tipoEstoque(nome);p.push({tipo:"pizza",chave:nome,tamanho,preco,indisponivel:Number(estoque[tipo]?.[chaveEstoquePizza(nome)]||0)<=0,nome:`${nomePizzaPainel(nome)}${tamanho==="U"?"":" · "+tamanho}`})}));Object.entries(c.bebidas||{}).forEach(([chave,preco])=>p.push({tipo:"bebida",chave,preco,nome:c.nomesBebidas?.[chave]?.nome||nomeProdutoCompleto(chave)}));return p}
function renderPrecos(){const d=$("#precos"),c=estado.catalogoPrecos;if(!d||!c)return;if(estado.catalogoPrecoAtual==="adicionar"){d.innerHTML=`<form id="formNovoItem" class="linha-promocao"><strong>Novo item do cardápio</strong><label>Tipo<select id="novoTipo"><option value="pizza">Pizza</option><option value="bebida">Bebida</option></select></label><label>Categoria<select id="novaCategoria"><option value="tradicionais">Tradicionais</option><option value="especiais">Especiais</option><option value="doces">Doces</option></select></label><label>Nome<input id="novoNome" required maxlength="80" placeholder="Ex.: Frango com cheddar"></label><label>Preço inicial<input id="novoPreco" required type="number" step=".01" min=".01" placeholder="0,00"></label><button class="btn primario">Adicionar ao cardápio</button><small class="promo-resumo">O item ficará disponível no bot, estoque e cardápio.</small></form>`;return}if(estado.catalogoPrecoAtual==="promocoes"){const busca=(estado.buscaPromo||"").toLowerCase();d.innerHTML='<div class="acao-salvar busca-precos"><label class="campo-busca-precos"><span>⌕</span><input id="buscaPromocoes" type="search" value="'+escapar(estado.buscaPromo||'')+'" placeholder="Buscar promoção por nome"></label></div>'+dadosProdutosPromocao().filter(item=>normalizarBuscaPainel(item.nome+" "+(item.tipo==="pizza"?"pizza pizzas":"bebida bebidas")).includes(normalizarBuscaPainel(busca))).sort((a,b)=>{const pa=a.tipo==="pizza"?c.promocoes?.pizzas?.[a.chave]?.[a.tamanho]:c.promocoes?.bebidas?.[a.chave];const pb=b.tipo==="pizza"?c.promocoes?.pizzas?.[b.chave]?.[b.tamanho]:c.promocoes?.bebidas?.[b.chave];return Number(Boolean(pb))-Number(Boolean(pa))||a.nome.localeCompare(b.nome,"pt-BR")}).map(item=>{const promo=item.tipo==="pizza"?c.promocoes?.pizzas?.[item.chave]?.[item.tamanho]:c.promocoes?.bebidas?.[item.chave];const id=encodeURIComponent(JSON.stringify(item));if(item.indisponivel)return '<article class="linha-promocao indisponivel"><strong>'+escapar(item.nome)+' · Indisponível</strong><small class="promo-resumo">Este sabor está indisponível e não pode receber promoção.</small>'+(promo?'<button class="btn perigo" data-remover-promo="'+id+'">Remover</button>':'')+'</article>';return '<article class="linha-promocao"><strong>'+escapar(item.nome)+'</strong><label>Etiqueta<input data-promo-nome="'+id+'" maxlength="80" value="'+escapar(promo?.nome||"Oferta especial")+'"></label><label>De<input type="number" step=".01" min=".01" data-promo-de="'+id+'" value="'+Number(promo?.de??item.preco).toFixed(2)+'"></label><label>Por<input type="number" step=".01" min=".01" data-promo-por="'+id+'" value="'+(promo?.por??"")+'"></label><button class="btn primario" data-aplicar-promo="'+id+'">Aplicar</button>'+(promo?'<button class="btn perigo" data-remover-promo="'+id+'">Remover</button><small class="promo-resumo">🔥 Ativa: de '+moeda(promo.de)+' por '+moeda(promo.por)+'</small>':'')+'</article>'}).join("");return}const tipo=estado.catalogoPrecoAtual;const busca=(estado.buscaPreco||"").toLowerCase();const produtos=tipo==="pizzas"?Object.entries(c.pizzas||{}).flatMap(([nome,t])=>Object.entries(t).map(([tamanho,preco])=>({tipo:"pizza",chave:nome,tamanho,nome:`${nomePizzaPainel(nome)}${tamanho==="U"?"":" · "+tamanho}`,preco}))):Object.entries(c.bebidas||{}).map(([chave,preco])=>({tipo:"bebida",chave,nome:c.nomesBebidas?.[chave]?.nome||nomeProdutoCompleto(chave),preco})).filter(item=>item.nome.toLowerCase().includes(busca));d.innerHTML='<div class="acao-salvar busca-precos"><button id="salvarPrecos" class="btn primario">Salvar alterações</button><label class="campo-busca-precos"><span>⌕</span><input id="buscaPrecos" type="search" value="'+escapar(estado.buscaPreco||'')+'" placeholder="Buscar por nome"></label></div>'+produtos.map(item=>{const k=chavePreco(item.tipo,item.chave,item.tamanho),v=estado.alteracoesPrecos[k]??item.preco;return '<article class="linha-preco"><strong>'+escapar(item.nome)+'</strong><label>Novo preço <input class="campo-preco" type="number" step=".01" min=".01" value="'+Number(v).toFixed(2)+'" data-preco-pendente="'+encodeURIComponent(JSON.stringify(item))+'"></label></article>'}).join("")}
estado.tipoDescricao="todos";
function renderIngredientes(){const d=$("#listaIngredientes");if(!d)return;const busca=String($("#buscarIngredientes")?.value||"").toLocaleLowerCase("pt-BR").trim(),tipo=estado.tipoDescricao||"todos",rotulos={tradicionais:"hamburgueres",especiais:"acompanhamentos",doces:"combos",bebidas:"bebidas"};const itens=(estado.ingredientesPizzas||[]).filter(x=>{const tipoItem=rotulos[x.categoria]||"hamburgueres",nome=x.tipo==="bebida"?x.nome:nomePizzaPainel(x.nome),texto=`${nome} ${x.nome} ${tipoItem}`;return(tipo==="todos"||tipo===tipoItem)&&normalizarBuscaPainel(texto).includes(normalizarBuscaPainel(busca))});d.innerHTML=itens.length?itens.map(x=>{const id=encodeURIComponent(JSON.stringify({tipo:x.tipo||"pizza",chave:x.chave||x.nome})),nome=x.tipo==="bebida"?x.nome:nomePizzaPainel(x.nome);return '<article class="linha-preco ingrediente-item"><strong>'+escapar(nome)+'</strong><label class="ingredientes-campo">Descrição<textarea rows="3" maxlength="500" data-descricao-produto="'+id+'">'+escapar(x.ingredientes||"")+'</textarea></label><button class="btn primario" data-salvar-descricao="'+id+'">Salvar</button></article>'}).join(""):'<div class="vazio">Nenhum produto encontrado.</div>'}
estado.tipoAdicional="todos";
function renderAdicionais(){const d=$("#listaAdicionais");if(!d)return;const busca=normalizarBuscaPainel($("#buscarAdicionais")?.value||""),tipo=estado.tipoAdicional||"todos",rotulos={hamburgueres:"Hambúrguer",acompanhamentos:"Acompanhamento",combos:"Combo"},itens=(estado.adicionais||[]).filter(item=>(tipo==="todos"||item.tipo===tipo)&&normalizarBuscaPainel(`${item.nome} ${rotulos[item.tipo]||""}`).includes(busca));const linha=(produto,adicional,indice)=>'<div class="linha-preco adicional-linha"><label>Nome do adicional<input maxlength="80" value="'+escapar(adicional.nome||"")+'" data-adicional-nome="'+encodeURIComponent(produto.nome)+'" data-adicional-indice="'+indice+'" placeholder="Ex.: Bacon extra"></label><label>Valor<input type="number" step=".01" min=".01" value="'+escapar(adicional.preco??"")+'" data-adicional-preco="'+encodeURIComponent(produto.nome)+'" data-adicional-indice="'+indice+'" placeholder="0,00"></label><button class="btn perigo" type="button" data-remover-adicional="'+encodeURIComponent(produto.nome)+'" data-adicional-indice="'+indice+'">Remover</button></div>';d.innerHTML='<div class="acao-salvar"><button id="salvarAdicionais" class="btn primario">Salvar alterações</button></div>'+(itens.length?itens.map(produto=>'<article class="linha-preco"><strong>'+escapar(produto.nome)+'</strong><small>'+rotulos[produto.tipo]+'</small><div class="lista-adicionais-produto">'+(produto.adicionais||[]).map((adicional,indice)=>linha(produto,adicional,indice)).join("")+'</div><button type="button" class="btn secundario" data-adicionar-adicional="'+encodeURIComponent(produto.nome)+'">+ Adicionar mais</button></article>').join(""):'<div class="vazio">Nenhum produto encontrado.</div>')}
estado.tipoImagem="todos";
function renderImagens(){const d=$("#listaImagens");if(!d)return;const busca=String($("#buscarImagens")?.value||"").toLocaleLowerCase("pt-BR").trim(),rotulos={pizzas:"Hambúrguer",acompanhamentos:"Acompanhamento",combos:"Combo",bebidas:"Bebida"};const itens=(estado.imagensProdutos||[]).filter(x=>{const nomeExibido=x.tipo==="pizzas"?nomePizzaPainel(x.nome):x.nome;const termos=`${nomeExibido} ${x.nome} ${rotulos[x.tipo]||""}`;return(estado.tipoImagem==="todos"||x.tipo===estado.tipoImagem)&&normalizarBuscaPainel(termos).includes(normalizarBuscaPainel(busca))});d.innerHTML=itens.length?itens.map(x=>{const id=encodeURIComponent(JSON.stringify({tipo:x.tipo,chave:x.chave,nome:x.nome})),rotulo=rotulos[x.tipo]||"Produto";return '<article class="imagem-item"><div class="imagem-preview '+(x.imagem?"tem-imagem":"")+'">'+(x.imagem?'<img src="'+escapar(x.imagem)+'" alt="'+escapar(x.nome)+'">':'<span>'+(x.tipo==="bebidas"?"🥤":x.tipo==="acompanhamentos"?"🍟":"🍔")+'</span><small>Sem foto</small>')+'</div><div class="imagem-info"><strong>'+escapar(x.tipo==="pizzas"?nomePizzaPainel(x.nome):x.nome)+'</strong><small>'+rotulo+'</small><input type="file" accept="image/jpeg,image/png,image/webp" data-arquivo-imagem="'+id+'"><div class="imagem-acoes"><button class="btn primario" data-publicar-imagem="'+id+'">Publicar imagem</button>'+(x.imagem?'<button class="btn perigo" data-remover-imagem="'+id+'">Remover</button>':'')+'</div></div></article>'}).join(""):'<div class="vazio">Nenhum produto encontrado.</div>'}
const aplicarGuiaAntesPreco=aplicarGuia;aplicarGuia=function(nome){aplicarGuiaAntesPreco(nome);if(nome==="precos")renderPrecos();if(nome==="ingredientes")renderIngredientes();if(nome==="imagens")renderImagens();if(nome==="adicionais")renderAdicionais()};
const renderPrecosCatalogoOriginal = renderPrecos;
renderPrecos = function () {
  const catalogoSelecionado = estado.catalogoPrecoAtual;
  if (["pizzas", "acompanhamentos", "combos"].includes(catalogoSelecionado)) {
    const categoria = catalogoSelecionado === "pizzas" ? "tradicionais" : catalogoSelecionado === "acompanhamentos" ? "especiais" : "doces";
    const catalogoCompleto = estado.catalogoPrecos;
    const produtos = Object.entries(catalogoCompleto?.pizzas || {}).filter(([nome]) => (catalogoCompleto.categoriasProdutos?.[nome] || "tradicionais") === categoria);
    estado.catalogoPrecos = { ...catalogoCompleto, pizzas: Object.fromEntries(produtos) };
    estado.catalogoPrecoAtual = "pizzas";
    renderPrecosCatalogoOriginal();
    estado.catalogoPrecos = catalogoCompleto;
    estado.catalogoPrecoAtual = catalogoSelecionado;
    if (!produtos.length) $("#precos").innerHTML = `<div class="vazio">Nenhum ${catalogoSelecionado === "pizzas" ? "hambúrguer" : catalogoSelecionado === "combos" ? "combo" : "acompanhamento"} cadastrado ainda.</div>`;
    return;
  }
  renderPrecosCatalogoOriginal();
};
document.querySelectorAll(".aba-preco").forEach(x=>x.addEventListener("click",()=>{estado.catalogoPrecoAtual=x.dataset.catalogo;document.querySelectorAll(".aba-preco").forEach(y=>y.classList.toggle("ativa",y===x));renderPrecos()}));
document.addEventListener("input",e=>{const campo=e.target.closest("[data-preco-pendente]");if(!campo)return;const x=JSON.parse(decodeURIComponent(campo.dataset.precoPendente));estado.alteracoesPrecos[chavePreco(x.tipo,x.chave,x.tamanho)]=campo.value});
document.addEventListener("click",async e=>{const salvar=e.target.closest("#salvarPrecos");const aplicar=e.target.closest("[data-aplicar-promo]");const remover=e.target.closest("[data-remover-promo]");if(!salvar&&!aplicar&&!remover)return;try{if(salvar){const alteracoes=Object.entries(estado.alteracoesPrecos);if(!alteracoes.length)return toast("Nenhum preço foi alterado.");salvar.disabled=true;salvar.textContent="Salvando...";for(const [k,preco] of alteracoes){const [tipo,chave,tamanho]=k.split("|");await api(tipo==="pizza"?"/api/painel/precos/pizza":"/api/painel/precos/bebida",{method:"PATCH",body:JSON.stringify(tipo==="pizza"?{nome:chave,tamanho,preco}:{chave,preco})})}estado.alteracoesPrecos={};estado.catalogoPrecos=await api("/api/painel/precos");renderPrecos();return toast("Preços salvos no bot e no cardápio.")}const x=JSON.parse(decodeURIComponent((aplicar||remover).dataset[aplicar?"aplicarPromo":"removerPromo"]));if(remover){if(!confirm("Remover esta promoção?"))return;await api("/api/painel/promocoes",{method:"DELETE",body:JSON.stringify(x)});estado.catalogoPrecos=await api("/api/painel/precos");renderPrecos();return toast("Promoção removida.")}const id=encodeURIComponent(JSON.stringify(x)),nome=document.querySelector('[data-promo-nome="'+id+'"]')?.value,de=document.querySelector('[data-promo-de="'+id+'"]')?.value,por=document.querySelector('[data-promo-por="'+id+'"]')?.value;await api("/api/painel/promocoes",{method:"PUT",body:JSON.stringify({...x,nome,de:String(de).replace(",","."),por:String(por).replace(",","."),ativa:true})});estado.catalogoPrecos=await api("/api/painel/precos");renderPrecos();toast("Promoção aplicada e etiqueta publicada.")}catch(e){toast(e.message)}});


document.addEventListener("submit",async e=>{if(e.target.id!=="formNovoItem")return;e.preventDefault();try{const tipo=$("#novoTipo").value,preco=tipo==="pizza"?$("#novoPrecoHamburguer").value:$("#novoPreco").value;await api("/api/painel/catalogo/item",{method:"POST",body:JSON.stringify({tipo,nome:$("#novoNome").value,ingredientes:$("#novoIngredientes").value,preco})});[estado.dados,estado.catalogoPrecos,estado.ingredientesPizzas,estado.imagensProdutos,estado.adicionais]=await Promise.all([api("/api/painel/dados"),api("/api/painel/precos"),api("/api/painel/ingredientes"),api("/api/painel/imagens"),api("/api/painel/adicionais")]);renderEstoque();renderPrecos();renderIngredientes();renderImagens();renderAdicionais();toast("Item adicionado ao cardápio.");e.target.reset();atualizarFormularioNovoItem()}catch(x){toast(x.message)}});document.addEventListener("input",e=>{if(!["buscaPrecos","buscaPromocoes"].includes(e.target.id))return;const busca=e.target.value.toLocaleLowerCase("pt-BR").trim();const seletor=e.target.id==="buscaPromocoes"?"#precos .linha-promocao":"#precos .linha-preco";document.querySelectorAll(seletor).forEach(card=>{card.hidden=busca!==""&&!normalizarBuscaPainel(card.textContent).includes(normalizarBuscaPainel(busca))})});
function atualizarFormularioNovoItem(){const hamburguer=$("#novoTipo")?.value==="pizza",precoHamburguer=$("#precoHamburguer"),precoUnitario=$("#grupoPrecoBebida"),grupoDescricao=$("#grupoIngredientesNovo"),campoDescricao=$("#novoIngredientes");if(precoHamburguer){precoHamburguer.hidden=!hamburguer;precoHamburguer.querySelector("input").required=hamburguer}if(precoUnitario){precoUnitario.hidden=hamburguer;precoUnitario.querySelector("input").required=!hamburguer}if(grupoDescricao)grupoDescricao.hidden=false;if(campoDescricao)campoDescricao.required=true}
document.addEventListener("change",e=>{if(e.target.id==="novoTipo")atualizarFormularioNovoItem()});
atualizarFormularioNovoItem();
document.addEventListener("input",e=>{if(e.target.id==="buscarIngredientes")renderIngredientes()});
document.addEventListener("click",e=>{const aba=e.target.closest(".aba-descricao");if(!aba)return;estado.tipoDescricao=aba.dataset.tipoDescricao;document.querySelectorAll(".aba-descricao").forEach(x=>x.classList.toggle("ativa",x===aba));renderIngredientes()});
document.addEventListener("input", e => {
  if (e.target.id === "buscarAdicionais") return renderAdicionais();
  const nomeCodificado = e.target.dataset.adicionalNome;
  const precoCodificado = e.target.dataset.adicionalPreco;
  if (!nomeCodificado && !precoCodificado) return;
  const nomeProduto = decodeURIComponent(nomeCodificado || precoCodificado);
  const produto = (estado.adicionais || []).find(item => item.nome === nomeProduto);
  const indice = Number(e.target.dataset.adicionalIndice);
  if (!produto || !produto.adicionais[indice]) return;
  if (nomeCodificado) produto.adicionais[indice].nome = e.target.value;
  if (precoCodificado) produto.adicionais[indice].preco = e.target.value;
  estado.adicionaisAlterados = true;
});
document.addEventListener("click", async e => {
  const aba = e.target.closest(".aba-adicional");
  if (aba) {
    estado.tipoAdicional = aba.dataset.tipoAdicional;
    document.querySelectorAll(".aba-adicional").forEach(x => x.classList.toggle("ativa", x === aba));
    return renderAdicionais();
  }
  const adicionar = e.target.closest("[data-adicionar-adicional]");
  const remover = e.target.closest("[data-remover-adicional]");
  const salvar = e.target.closest("#salvarAdicionais");
  if (adicionar || remover) {
    const nomeProduto = decodeURIComponent((adicionar || remover).dataset[adicionar ? "adicionarAdicional" : "removerAdicional"]);
    const produto = (estado.adicionais || []).find(item => item.nome === nomeProduto);
    if (!produto) return;
    if (adicionar) produto.adicionais.push({ nome: "", preco: "" });
    else produto.adicionais.splice(Number(remover.dataset.adicionalIndice), 1);
    estado.adicionaisAlterados = true;
    return renderAdicionais();
  }
  if (!salvar) return;
  try {
    salvar.disabled = true;
    salvar.textContent = "Salvando...";
    const adicionais = Object.fromEntries((estado.adicionais || []).map(item => [item.nome, (item.adicionais || []).map(adicional => ({
      nome: String(adicional.nome || "").trim(),
      preco: String(adicional.preco ?? "").replace(",", ".")
    }))]));
    await api("/api/painel/adicionais", { method: "PUT", body: JSON.stringify({ adicionais }) });
    // Recarrega do servidor para mostrar apenas o que foi gravado de verdade.
    estado.adicionais = await api(`/api/painel/adicionais?_=${Date.now()}`, { cache: "no-store" });
    estado.adicionaisAlterados = false;
    renderAdicionais();
    toast("Adicionais salvos.");
  } catch (erro) {
    toast(erro.message);
  } finally {
    salvar.disabled = false;
    salvar.textContent = "Salvar alterações";
  }
});
document.addEventListener("click",async e=>{const botao=e.target.closest("[data-salvar-descricao]");if(!botao)return;const produto=JSON.parse(decodeURIComponent(botao.dataset.salvarDescricao)),id=encodeURIComponent(JSON.stringify(produto)),campo=document.querySelector('[data-descricao-produto="'+id+'"]');try{botao.disabled=true;await api(produto.tipo==="bebida"?"/api/painel/ingredientes/bebida":"/api/painel/ingredientes/pizza",{method:"PATCH",body:JSON.stringify(produto.tipo==="bebida"?{chave:produto.chave,ingredientes:campo?.value||""}:{nome:produto.chave,ingredientes:campo?.value||""})});estado.ingredientesPizzas=await api("/api/painel/ingredientes");renderIngredientes();toast("Descrição atualizada no cardápio.")}catch(x){toast(x.message)}finally{botao.disabled=false}});

document.addEventListener("input",e=>{if(e.target.id==="buscarImagens")renderImagens()});
document.querySelectorAll("[data-tipo-imagem]").forEach(b=>b.addEventListener("click",()=>{estado.tipoImagem=b.dataset.tipoImagem;document.querySelectorAll("[data-tipo-imagem]").forEach(x=>x.classList.toggle("ativa",x===b));renderImagens()}));
function lerImagemArquivo(arquivo){return new Promise((resolve,reject)=>{if(!arquivo)return reject(new Error("Escolha uma imagem."));if(arquivo.size>3*1024*1024)return reject(new Error("A imagem deve ter no máximo 3 MB."));const leitor=new FileReader();leitor.onload=()=>resolve(leitor.result);leitor.onerror=()=>reject(new Error("Não foi possível ler a imagem."));leitor.readAsDataURL(arquivo)})}
document.addEventListener("click",async e=>{const publicar=e.target.closest("[data-publicar-imagem]"),remover=e.target.closest("[data-remover-imagem]");if(!publicar&&!remover)return;const botao=publicar||remover,x=JSON.parse(decodeURIComponent(botao.dataset[publicar?"publicarImagem":"removerImagem"]));try{botao.disabled=true;if(remover){if(!confirm("Remover a imagem deste produto?"))return;await api("/api/painel/imagens/"+encodeURIComponent(x.tipo)+"/"+encodeURIComponent(x.chave),{method:"DELETE"});toast("Imagem removida do cardápio.")}else{const campo=document.querySelector('[data-arquivo-imagem="'+encodeURIComponent(JSON.stringify(x))+'"]'),imagem=await lerImagemArquivo(campo?.files?.[0]);await api("/api/painel/imagens/"+encodeURIComponent(x.tipo)+"/"+encodeURIComponent(x.chave),{method:"PUT",body:JSON.stringify({imagem})});toast("Imagem publicada no cardápio.")}estado.imagensProdutos=await api("/api/painel/imagens");renderImagens()}catch(erro){toast(erro.message)}finally{botao.disabled=false}});
