const params = new URLSearchParams(location.search);
const pedidoId = params.get("pedido");
const checkoutToken = params.get("token") || "";
const checkoutExpires = params.get("exp") || "";
let pedidoAtual;
let tipoSelecionado = "pix";
let modalidadeSelecionada = "entrega";
let cardBrickController;
let mercadoPagoPublicKey = "";
let taxaEntrega = 0;
let configuracaoEntrega = {};
let totalFinalAtual = 0;
let buscaEnderecoTimer;
let buscaEnderecoControle = 0;
let pixTimerId;
let enderecoSelecionado = {};
let confirmacaoTimerId;

const $ = id => document.getElementById(id);
const telas = ["telaEndereco", "telaMetodos", "telaPix", "telaCartao"];
const btnPagar = $("btnPagar");
const resultado = $("resultado");
const btnVoltar = $("btnVoltar");

function mostrarConfirmacaoAnimada(mensagem) {
  clearTimeout(confirmacaoTimerId);
  mostrarResultado(`
    <div class="confirmation-success" role="status" aria-live="polite">
      <div class="confirmation-icon is-loading" aria-hidden="true">
        <span class="confirmation-spinner"></span>
        <svg class="confirmation-check" viewBox="0 0 52 52">
          <path d="M14 27l8 8 17-19"></path>
        </svg>
      </div>
      <div class="confirmation-copy">
        <h3>Confirmando pedido...</h3>
        <p>Aguarde só um instante.</p>
      </div>
    </div>
  `);

  confirmacaoTimerId = setTimeout(() => {
    const caixa = resultado.querySelector(".confirmation-success");
    if (!caixa) return;
    caixa.querySelector(".confirmation-icon").classList.replace("is-loading", "is-confirmed");
    caixa.querySelector("h3").textContent = "Pedido confirmado!";
    caixa.querySelector("p").textContent = mensagem;
  }, 900);
}

$("contato").addEventListener("input", event => {
  event.currentTarget.value = event.currentTarget.value
    .replace(/\D/g, "")
    .slice(0, 11);
});

$("cep").addEventListener("input", event => {
  event.currentTarget.value = event.currentTarget.value
    .replace(/\D/g, "")
    .slice(0, 8);
});

const estadosBrasil = [
  ["AC","Acre"],["AL","Alagoas"],["AP","Amapá"],["AM","Amazonas"],["BA","Bahia"],["CE","Ceará"],
  ["DF","Distrito Federal"],["ES","Espírito Santo"],["GO","Goiás"],["MA","Maranhão"],["MT","Mato Grosso"],
  ["MS","Mato Grosso do Sul"],["MG","Minas Gerais"],["PA","Pará"],["PB","Paraíba"],["PR","Paraná"],
  ["PE","Pernambuco"],["PI","Piauí"],["RJ","Rio de Janeiro"],["RN","Rio Grande do Norte"],["RS","Rio Grande do Sul"],
  ["RO","Rondônia"],["RR","Roraima"],["SC","Santa Catarina"],["SP","São Paulo"],["SE","Sergipe"],["TO","Tocantins"]
];

function montarEstados() {
  $("estadoEntrega").innerHTML = estadosBrasil.map(([sigla,nome]) => `<option value="${sigla}">${nome}</option>`).join("");
  $("estadoEntrega").value = configuracaoEntrega.estadoAtendido || "SE";
  $("cidadeEntrega").value = configuracaoEntrega.cidadeAtendida || "Estância";
}

function atualizarMensagemTaxaEntregaInicial() {
  const status = $("statusTaxaEntrega");
  if (configuracaoEntrega.modoTaxa === "fixa") {
    status.textContent = "Taxa fixa de entrega: " + dinheiro(Number(configuracaoEntrega.taxaFixa || 0)) + ".";
    return;
  }
  status.textContent = "A taxa por quilômetro será calculada conforme a localização informada.";
}

function esconderSugestoes() {
  $("sugestoesEndereco").classList.add("hidden");
  $("sugestoesEndereco").innerHTML = "";
}

function selecionarSugestaoEndereco(item) {
  preencherEnderecoLocalizado(item);
  esconderSugestoes();
  $("statusLocalizacao").classList.remove("error");
  $("statusLocalizacao").textContent = "Endereço selecionado. Informe o número e os demais dados para continuar.";
  $("numero").focus();
}

async function buscarSugestoesEndereco() {
  const rua = $("rua").value.trim();
  const bairro = $("bairro").value.trim();
  const cidade = $("cidadeEntrega").value.trim();
  const estado = $("estadoEntrega").value;
  if (!estado || !cidade || Math.max(rua.length,bairro.length) < 2) return esconderSugestoes();
  const controle = ++buscaEnderecoControle;
  try {
    const itens = await json(`/api/enderecos/sugestoes?q=${encodeURIComponent([rua,bairro].filter(Boolean).join(" "))}&cidade=${encodeURIComponent(cidade)}&estado=${encodeURIComponent(estado)}`);
    if (controle !== buscaEnderecoControle) return;
    $("sugestoesEndereco").innerHTML = itens.map((item,indice) =>
      `<button type="button" role="option" data-indice="${indice}"><strong>${item.logradouro || item.rua || "Endereço"}</strong><small>${item.texto || [item.bairro,item.cidade,item.estado].filter(Boolean).join(" — ")}</small></button>`
    ).join("");
    $("sugestoesEndereco").classList.toggle("hidden", !itens.length);
    $("sugestoesEndereco").querySelectorAll("button").forEach((botao,indice) => {
      botao.addEventListener("click", () => selecionarSugestaoEndereco(itens[indice]));
    });
  } catch {
    esconderSugestoes();
  }
}

["rua","bairro"].forEach(id => $(id).addEventListener("input", () => {
  enderecoSelecionado = {};
  clearTimeout(buscaEnderecoTimer);
  buscaEnderecoTimer = setTimeout(buscarSugestoesEndereco, 750);
}));
["estadoEntrega","cidadeEntrega"].forEach(id => $(id).addEventListener("change", () => {
  enderecoSelecionado = {};
  esconderSugestoes();
}));
document.addEventListener("click", evento => {
  if (!evento.target.closest("#sugestoesEndereco") && !evento.target.closest("#rua") && !evento.target.closest("#bairro")) esconderSugestoes();
});

let mapaLocalizacao;
let marcadorLocalizacao;
let coordenadasMapa = null;
let enderecoMapa = null;

function preencherEnderecoLocalizado(endereco) {
  enderecoSelecionado = endereco;
  $("rua").value = endereco.rua || "";
  $("numero").value = endereco.numero || "";
  $("bairro").value = endereco.bairro || "";
  $("cep").value = endereco.cep || "";
  if (endereco.estado) $("estadoEntrega").value = endereco.estado;
  if (endereco.cidade) $("cidadeEntrega").value = endereco.cidade;
}

async function consultarEnderecoMapa(latitude, longitude) {
  return json(`/api/enderecos/localizacao-atual?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`);
}

function fecharMapaLocalizacao() {
  $("modalLocalizacao").classList.add("hidden");
  document.body.classList.remove("location-modal-open");
}

function atualizarPontoMapa(latitude, longitude, centralizar = false) {
  coordenadasMapa = { latitude, longitude };
  marcadorLocalizacao.setLatLng([latitude, longitude]);
  if (centralizar) mapaLocalizacao.setView([latitude, longitude], Math.max(mapaLocalizacao.getZoom(), 18));
  enderecoMapa = null;
  $("statusMapa").textContent = "Novo ponto selecionado. Confirme para buscar o endereço.";
}

async function abrirMapaLocalizacao(latitude, longitude) {
  if (typeof L === "undefined") {
    throw new Error("O mapa não carregou. Verifique a internet e tente novamente.");
  }

  $("modalLocalizacao").classList.remove("hidden");
  document.body.classList.add("location-modal-open");
  coordenadasMapa = { latitude, longitude };
  enderecoMapa = null;

  if (!mapaLocalizacao) {
    mapaLocalizacao = L.map("mapaLocalizacao", {
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(mapaLocalizacao);

    marcadorLocalizacao = L.marker([latitude, longitude], {
      draggable: true,
      title: "Arraste para ajustar a entrega"
    }).addTo(mapaLocalizacao);

    marcadorLocalizacao.on("dragend", event => {
      const ponto = event.target.getLatLng();
      atualizarPontoMapa(ponto.lat, ponto.lng);
    });

    mapaLocalizacao.on("click", event => {
      atualizarPontoMapa(event.latlng.lat, event.latlng.lng);
    });
  }

  mapaLocalizacao.setView([latitude, longitude], 18);
  marcadorLocalizacao.setLatLng([latitude, longitude]);
  setTimeout(() => mapaLocalizacao.invalidateSize(), 80);

  $("statusMapa").textContent = "Buscando o endereço deste ponto...";
  try {
    enderecoMapa = await consultarEnderecoMapa(latitude, longitude);
    $("statusMapa").textContent = [enderecoMapa.rua, enderecoMapa.numero, enderecoMapa.bairro]
      .filter(Boolean)
      .join(", ") || "Localização encontrada. Ajuste o marcador se necessário.";
  } catch {
    $("statusMapa").textContent = "Localização encontrada. Ajuste o marcador e confirme.";
  }
}

$("btnMinhaLocalizacao").addEventListener("click", () => {
  const botao = $("btnMinhaLocalizacao");
  const status = $("statusLocalizacao");
  status.classList.remove("error");

  if (!navigator.geolocation) {
    status.textContent = "Este navegador não oferece acesso à localização. Preencha o endereço manualmente.";
    status.classList.add("error");
    return;
  }

  botao.disabled = true;
  botao.textContent = "📍 Localizando...";
  status.textContent = "Autorize o acesso à localização quando o celular solicitar.";

  navigator.geolocation.getCurrentPosition(async posicao => {
    try {
      const { latitude, longitude } = posicao.coords;
      await abrirMapaLocalizacao(latitude, longitude);
      status.textContent = "Ajuste o ponto no mapa e confirme a localização.";
    } catch (erro) {
      status.textContent = erro.message;
      status.classList.add("error");
    } finally {
      botao.disabled = false;
      botao.textContent = "📍 Usar minha localização atual";
    }
  }, erro => {
    const mensagens = {
      1: "Permissão de localização negada. Autorize o navegador ou preencha manualmente.",
      2: "O celular não conseguiu determinar sua localização. Tente novamente em um local aberto.",
      3: "A localização demorou demais. Tente novamente."
    };
    status.textContent = mensagens[erro.code] || "Não foi possível obter sua localização.";
    status.classList.add("error");
    botao.disabled = false;
    botao.textContent = "📍 Usar minha localização atual";
  }, {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 60000
  });
});

$("btnConfirmarLocalizacao").addEventListener("click", async () => {
  const botao = $("btnConfirmarLocalizacao");
  const statusMapa = $("statusMapa");
  if (!coordenadasMapa) return;

  botao.disabled = true;
  botao.textContent = "Confirmando...";
  statusMapa.textContent = "Buscando o endereço do ponto escolhido...";

  try {
    const { latitude, longitude } = coordenadasMapa;
    const endereco = enderecoMapa || await consultarEnderecoMapa(latitude, longitude);
    const calculo = await json("/api/enderecos/calcular-entrega", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude })
    });
    taxaEntrega = Number(calculo.taxaEntrega || 0);
    preencherEnderecoLocalizado({ ...endereco, latitude, longitude, taxaEntrega, distanciaKm: calculo.distanciaKm });
    atualizarTotais();
    $("statusTaxaEntrega").textContent = calculo.modoTaxa === "fixa"
      ? `Taxa fixa confirmada: ${dinheiro(taxaEntrega)}.`
      : `Taxa de entrega para a localização informada: ${dinheiro(taxaEntrega)}.`;
    fecharMapaLocalizacao();

    const status = $("statusLocalizacao");
    status.classList.remove("error");
    status.textContent = endereco.cep
      ? "Localização confirmada. Confira os dados e informe o tipo de residência."
      : "Localização confirmada. Confira os dados e preencha o CEP.";
    (endereco.numero ? $("complemento") : $("numero")).focus();
  } catch (erro) {
    statusMapa.textContent = erro.message || "Não foi possível identificar o endereço deste ponto.";
  } finally {
    botao.disabled = false;
    botao.textContent = "Confirmar localização";
  }
});

$("btnFecharMapa").addEventListener("click", fecharMapaLocalizacao);
$("btnCancelarLocalizacao").addEventListener("click", fecharMapaLocalizacao);
$("modalLocalizacao").addEventListener("click", event => {
  if (event.target === event.currentTarget) fecharMapaLocalizacao();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("modalLocalizacao").classList.contains("hidden")) {
    fecharMapaLocalizacao();
  }
});

function atualizarTotais() {
  if (!pedidoAtual) return;
  const valorPedido = Number(pedidoAtual.total || 0);
  const valorEntrega = modalidadeSelecionada === "entrega" ? taxaEntrega : 0;
  totalFinalAtual = Number((valorPedido + valorEntrega).toFixed(2));
  $("pedidoSubtotal").textContent = dinheiro(valorPedido);
  $("pedidoTaxaEntrega").textContent = dinheiro(valorEntrega);
  $("pedidoTotal").textContent = dinheiro(totalFinalAtual);
}

function preencherHorarios(modalidade) {
  const select = $("horario");
  const horarios = [
    "18:00", "18:30",
    "19:00", "19:30",
    "20:00", "20:30",
    "21:00", "21:30",
    "22:00", "22:30",
    "23:00"
  ];

  select.innerHTML = "";

  if (modalidade === "retirada") {
    const rapido = document.createElement("option");
    rapido.value = "assim_que_possivel";
    rapido.textContent = "⚡ O MAIS RÁPIDO POSSÍVEL";
    select.appendChild(rapido);
  }

  horarios.forEach(horario => {
    const option = document.createElement("option");
    option.value = horario;
    option.textContent = horario;
    select.appendChild(option);
  });
}

function configurarModalidade(modalidade) {
  modalidadeSelecionada = modalidade;
  atualizarTotais();

  document.querySelectorAll(".delivery-option").forEach(option => {
    option.classList.toggle(
      "active",
      option.dataset.modalidade === modalidade
    );
  });

  const entrega = modalidade === "entrega";
  const salao = modalidade === "salao";

  $("camposEntrega").classList.toggle("hidden", !entrega);
  $("cep").required = entrega;
  $("cep").disabled = !entrega;
  $("complemento").required = entrega;
  $("complemento").disabled = !entrega;
  $("camposAgendamento").classList.toggle("hidden", entrega);
  $("campoPessoas").classList.toggle("hidden", !salao);

  if (!entrega) {
    preencherHorarios(modalidade);
  }

  $("tituloFormulario").textContent = entrega
    ? "Endereço de entrega"
    : salao
      ? "Dados para consumir no salão"
      : "Dados para retirada";

  $("tituloDinheiro").textContent = entrega
    ? "Dinheiro na entrega"
    : "Dinheiro no estabelecimento";
  $("tituloMaquininha").textContent = entrega
    ? "Cartão na entrega"
    : "Cartão no estabelecimento";
  $("descricaoDinheiro").textContent = entrega
    ? "Informe se precisa de troco"
    : salao
      ? "Pague em dinheiro no caixa"
      : "Pague em dinheiro ao retirar";
  $("descricaoMaquininha").textContent = entrega
    ? "O entregador leva a maquininha"
    : salao
      ? "Pague com cartão no caixa"
      : "Pague com cartão ao retirar";
  $("tituloConfirmacaoLocal").textContent = $("tituloMaquininha").textContent;
  $("textoConfirmacaoLocal").textContent = entrega
    ? "O entregador levará a maquininha."
    : "O pagamento será feito no estabelecimento.";
}

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mostrarResultado(html) {
  resultado.innerHTML = html;
  resultado.classList.remove("hidden");
}

function esconderResultado() {
  clearTimeout(confirmacaoTimerId);
  resultado.innerHTML = "";
  resultado.classList.add("hidden");
}

function mostrarTela(nome) {
  telas.forEach(id => $(id).classList.toggle("hidden", id !== nome));
  btnPagar.classList.add("hidden");
  btnVoltar.classList.toggle("hidden", nome === "telaEndereco");
  $("painelTroco").classList.add("hidden");
  $("painelMaquininha").classList.add("hidden");
  const titulos = {
    telaEndereco: "Endereço de entrega",
    telaMetodos: "Pagamento",
    telaPix: "PIX Online",
    telaCartao: "Cartão online"
  };
  $("tituloTela").textContent = titulos[nome];
  const etapa = nome === "telaEndereco" ? "endereco" : (nome === "telaMetodos" ? "pagamento" : "confirmacao");
  document.querySelectorAll("[data-progress]").forEach(item => {
    const ordem = { endereco: 1, pagamento: 2, confirmacao: 3 };
    item.classList.toggle("active", item.dataset.progress === etapa);
    item.classList.toggle("complete", ordem[item.dataset.progress] < ordem[etapa]);
  });
  if (nome === "telaPix") {
    btnPagar.classList.remove("hidden");
    btnPagar.textContent = `Pagar ${dinheiro(totalFinalAtual)}`;
  }
}

async function json(url, opcoes) {
  const protegida = /^\/api\/(?:pedido|pagamento)\//.test(url);
  const configuracao = { ...(opcoes || {}) };
  configuracao.headers = { ...(opcoes?.headers || {}) };

  if (protegida) {
    configuracao.headers["X-Checkout-Token"] = checkoutToken;
    configuracao.headers["X-Checkout-Expires"] = checkoutExpires;
  }

  const resposta = await fetch(url, configuracao);
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir.");
  return dados;
}

$("formEndereco").addEventListener("submit", async event => {
  event.preventDefault();
  const erro = $("erroEndereco");
  erro.classList.add("hidden");
  const botao = event.submitter;
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    const totais = await json(`/api/pedido/${encodeURIComponent(pedidoId)}/endereco`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modalidade: modalidadeSelecionada,
        nome: $("nomeCliente").value,
        contato: $("contato").value,
        rua: $("rua").value,
        numero: $("numero").value,
        bairro: $("bairro").value,
        cidade: $("cidadeEntrega").value,
        estado: $("estadoEntrega").value,
        cep: $("cep").value,
        complemento: $("complemento").value,
        referencia: $("referencia").value,
        horario: $("horario").value,
        quantidadePessoas: $("quantidadePessoas").value,
        latitude: enderecoSelecionado.latitude,
        longitude: enderecoSelecionado.longitude,
        taxaEntrega: enderecoSelecionado.taxaEntrega,
        distanciaKm: enderecoSelecionado.distanciaKm
      })
    });
    taxaEntrega = Number(totais.taxaEntrega || 0);
    totalFinalAtual = Number(totais.totalFinal);
    atualizarTotais();
    mostrarTela("telaMetodos");
  } catch (err) {
    erro.textContent = err.message;
    erro.classList.remove("hidden");
  } finally {
    botao.disabled = false;
    botao.textContent = "Continuar para pagamento";
  }
});

async function destruirBrickCartao() {
  if (cardBrickController) {
    await cardBrickController.unmount();
    cardBrickController = null;
  }
}

async function montarBrickCartao() {
  await destruirBrickCartao();
  const container = $("cardPaymentBrick_container");
  container.innerHTML = '<p class="card-loading">Carregando formulário seguro...</p>';
  if (!mercadoPagoPublicKey) {
    container.innerHTML = '<div class="form-error">O pagamento por cartão online ainda não está configurado. Cadastre MP_PUBLIC_KEY no Render.</div>';
    return;
  }
  if (typeof MercadoPago !== "function") {
    container.innerHTML = '<div class="form-error">Não foi possível carregar o formulário do Mercado Pago. Verifique sua conexão e tente novamente.</div>';
    return;
  }
  const mp = new MercadoPago(mercadoPagoPublicKey, { locale: "pt-BR" });
  cardBrickController = await mp.bricks().create("cardPayment", "cardPaymentBrick_container", {
    initialization: { amount: totalFinalAtual },
    callbacks: {
      onReady: () => {},
      onSubmit: async cardFormData => {
        esconderResultado();
        const dados = await json(`/api/pagamento/${encodeURIComponent(pedidoId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "cartao", ...cardFormData })
        });
        if (dados.status === "approved") {
          mostrarConfirmacaoAnimada("Pagamento aprovado. Seu pedido já foi enviado para o atendimento.");
        } else {
          mostrarResultado(`<h3>Pagamento recebido</h3><p>Status: ${dados.status || "em análise"}</p>`);
        }
      },
      onError: error => {
        console.error(error);
        mostrarResultado("<p>Erro no formulário do cartão.</p>");
      }
    }
  });
}

document.querySelectorAll(".option").forEach(option => option.addEventListener("click", async () => {
  tipoSelecionado = option.dataset.tipo;
  document.querySelectorAll(".option").forEach(item => item.classList.toggle("active", item === option));
  esconderResultado();
  $("painelTroco").classList.add("hidden");
  $("painelMaquininha").classList.add("hidden");

  if (tipoSelecionado === "pix") {
    await destruirBrickCartao();
    mostrarTela("telaPix");
  } else if (tipoSelecionado === "cartao") {
    mostrarTela("telaCartao");
    try {
      await montarBrickCartao();
    } catch (erroCartao) {
      console.error(erroCartao);
      $("cardPaymentBrick_container").innerHTML = `<div class="form-error">${erroCartao.message || "Não foi possível abrir o formulário do cartão."}</div>`;
    }
  } else if (tipoSelecionado === "dinheiro") {
    await destruirBrickCartao();
    $("painelTroco").classList.remove("hidden");
  } else if (tipoSelecionado === "maquininha") {
    await destruirBrickCartao();
    $("painelMaquininha").classList.remove("hidden");
  }
}));

document.querySelectorAll(".delivery-option").forEach(option => {
  option.addEventListener("click", () => {
    configurarModalidade(option.dataset.modalidade);
  });
});

document.querySelectorAll('input[name="precisaTroco"]').forEach(input => {
  input.addEventListener("change", () => {
    $("campoTroco").classList.toggle(
      "hidden",
      document.querySelector('input[name="precisaTroco"]:checked').value !== "sim"
    );
  });
});

async function confirmarPagamentoLocal(tipo) {
  const erro = $("erroTroco");
  erro.classList.add("hidden");
  let trocoPara = null;

  if (tipo === "dinheiro") {
    const precisaTroco =
      document.querySelector('input[name="precisaTroco"]:checked').value === "sim";

    if (precisaTroco) {
      const valorTroco = Number(
        String($("trocoPara").value).replace(/\./g, "").replace(",", ".")
      );

      if (!Number.isFinite(valorTroco) || valorTroco <= 0) {
        erro.textContent = "Informe um valor de troco maior que zero.";
        erro.classList.remove("hidden");
        return;
      }
      // A API mantém o campo histórico `trocoPara`; somamos o total para que
      // ela grave em `troco` exatamente o valor solicitado pelo cliente.
      trocoPara = Number((totalFinalAtual + valorTroco).toFixed(2));
    }
  }

  const botao = tipo === "dinheiro"
    ? $("btnConfirmarDinheiro")
    : $("btnConfirmarMaquininha");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Confirmando...";
  mostrarResultado("<p>⏳ Estamos confirmando seu pedido. Não feche esta página.</p>");

  try {
    const tipoCartao = null;
    const parcelas = 1;

    const dados = await json(
      `/api/pedido/${encodeURIComponent(pedidoId)}/pagamento-local`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, trocoPara, tipoCartao, parcelas })
      }
    );

    $("painelTroco").classList.add("hidden");
    $("painelMaquininha").classList.add("hidden");
    mostrarConfirmacaoAnimada(
      `${dados.mensagem} Você receberá as atualizações pelo WhatsApp.`
    );
  } catch (err) {
    mostrarResultado(`<p>${err.message}</p>`);
  } finally {
    if (!resultado.querySelector(".confirmation-success")) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    } else {
      botao.textContent = "Pedido confirmado";
    }
  }
}

$("btnConfirmarDinheiro").addEventListener(
  "click",
  () => confirmarPagamentoLocal("dinheiro")
);
$("btnConfirmarMaquininha").addEventListener(
  "click",
  () => confirmarPagamentoLocal("maquininha")
);

function iniciarContagemPix(expiraEm) {
  clearTimeout(pixTimerId);
  const atualizar = () => {
    const restante = expiraEm - Date.now();
    const timer = $("pixTimer");
    if (!timer) return;
    if (restante <= 0) {
      timer.textContent = "PIX expirado";
      $("btnCopiarPix").disabled = true;
      return;
    }
    const segundos = Math.ceil(restante / 1000);
    timer.textContent = `Expira em ${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
    pixTimerId = setTimeout(atualizar, 1000);
  };
  atualizar();
}

btnPagar.addEventListener("click", async () => {
  btnPagar.disabled = true;
  try {
    const dados = await json(`/api/pagamento/${encodeURIComponent(pedidoId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "pix" })
    });
    mostrarResultado(`<div class="qr-result"><p>Escaneie o QR Code ou copie o código PIX.</p><strong id="pixTimer" class="pix-timer"></strong>${dados.qrCodeBase64 ? `<img class="qr" src="data:image/png;base64,${dados.qrCodeBase64}" alt="QR Code PIX">` : ""}<textarea id="codigoPix" class="copy" readonly></textarea><button id="btnCopiarPix" class="copy-button" type="button">Copiar código PIX</button></div>`);
    $("codigoPix").value = dados.copiaCola || "";
    $("btnCopiarPix").addEventListener("click", async event => {
      await navigator.clipboard.writeText($("codigoPix").value);
      event.currentTarget.textContent = "Código copiado";
    });
    iniciarContagemPix(Number(dados.expiresAtMs));
    btnPagar.classList.add("hidden");
  } catch (err) {
    mostrarResultado(`<p>${err.message}</p>`);
  } finally {
    btnPagar.disabled = false;
  }
});

btnVoltar.addEventListener("click", async () => {
  esconderResultado();
  if (!$("telaMetodos").classList.contains("hidden")) {
    mostrarTela("telaEndereco");
    configurarModalidade("entrega");
  } else {
    await destruirBrickCartao();
    mostrarTela("telaMetodos");
  }
});

async function iniciar() {
  try {
    if (!pedidoId || !checkoutToken || !checkoutExpires) {
      throw new Error("Link inválido ou incompleto.");
    }
    const [config, pedido] = await Promise.all([
      json("/api/config"),
      json(`/api/pedido/${encodeURIComponent(pedidoId)}`)
    ]);
    mercadoPagoPublicKey = config.publicKey;
    configuracaoEntrega = config.entrega || {};
    taxaEntrega = configuracaoEntrega.modoTaxa === "fixa" ? Number(configuracaoEntrega.taxaFixa || 0) : 0;
    atualizarMensagemTaxaEntregaInicial();
    montarEstados();
    pedidoAtual = pedido;
    $("pedidoId").textContent = pedido.id;
    configurarModalidade("entrega");
    mostrarTela("telaEndereco");
  } catch (err) {
    telas.forEach(id => $(id).classList.add("hidden"));
    btnPagar.classList.add("hidden");
    $("tituloTela").textContent = "Link indisponível";
    mostrarResultado(`
      <div class="invalid-link" role="alert">
        <strong>Este link não pode mais ser usado.</strong>
        <p>${err.message}</p>
        <p>Volte ao WhatsApp e solicite um novo link ao bot.</p>
      </div>
    `);
    console.error(err);
  }
}

iniciar();

