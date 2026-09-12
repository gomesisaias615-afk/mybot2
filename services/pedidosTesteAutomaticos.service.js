const { obterPizzas, obterPrecosPizzas, obterNomesBebidas, obterPrecosBebidas } = require("../flows/cardapio");
const { criarPedidoPendente, confirmarPedidoTeste } = require("./monitoramento/pedidos.service");
const { salvarEnderecoPedido } = require("./enderecoPedido.service");
const { obterClienteWhatsApp } = require("./whatsappRuntime.service");

let temporizador = null;

function aleatorio(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
function telefoneTeste() { return String(process.env.TEST_ORDER_PHONE || "").replace(/\D/g, ""); }
function habilitado() { return String(process.env.TEST_ORDER_AUTOMATICO || "").toLowerCase() === "true"; }

function montarItensTeste() {
  const precosPizzas = obterPrecosPizzas();
  const pizzasDisponiveis = obterPizzas()
    .map(item => item.nome)
    .filter(nome => ["M", "G"].some(tamanho => Number(precosPizzas[nome]?.[tamanho]) > 0));
  if (!pizzasDisponiveis.length) throw new Error("Não há pizzas M ou G com preço para gerar o pedido de teste.");

  const sabor = aleatorio(pizzasDisponiveis);
  const tamanho = aleatorio(["M", "G"].filter(item => Number(precosPizzas[sabor]?.[item]) > 0));
  const pizzas = [{ sabores: [sabor], sabor, tamanho, quantidade: 1 + Math.floor(Math.random() * 2), valor: Number(precosPizzas[sabor][tamanho]) }];
  const nomesBebidas = obterNomesBebidas();
  const precosBebidas = obterPrecosBebidas();
  const chavesBebidas = Object.keys(nomesBebidas).filter(chave => Number(precosBebidas[chave]) > 0);
  const bebidas = chavesBebidas.length && Math.random() >= 0.35
    ? [{ chave: aleatorio(chavesBebidas), nome: nomesBebidas[aleatorio(chavesBebidas)]?.nome, quantidade: 1, valor: 0 }]
    : [];
  // Escolhe a bebida uma única vez para que nome e preço correspondam.
  if (bebidas.length) {
    const chave = bebidas[0].chave;
    bebidas[0].nome = nomesBebidas[chave].nome;
    bebidas[0].valor = Number(precosBebidas[chave]);
  }
  return { pizzas, bebidas };
}

function montarRecebimentoTeste(telefone) {
  const modalidade = aleatorio(["entrega", "salao", "retirada"]);
  const pagamento = aleatorio(["pix", "dinheiro", "maquininha", "cartao_online"]);
  return {
    cliente: telefone,
    nome: "🧪 Cliente de teste",
    contato: `+${telefone}`,
    modalidade,
    // Dados explicitamente fictícios: nunca representam uma rota real.
    rua: modalidade === "entrega" ? "ENDEREÇO DE TESTE — Estância" : "Não se aplica",
    numero: modalidade === "entrega" ? String(100 + Math.floor(Math.random() * 900)) : "Não se aplica",
    bairro: modalidade === "entrega" ? "Centro (teste)" : "Não se aplica",
    cidade: "Estância",
    estado: "SE",
    cep: modalidade === "entrega" ? "49200000" : "Não se aplica",
    complemento: "Pedido gerado automaticamente para teste",
    referencia: "Não enviar entregador — teste automático",
    horario: modalidade === "entrega" ? "Não se aplica" : "assim_que_possivel",
    quantidadePessoas: modalidade === "salao" ? 1 + Math.floor(Math.random() * 5) : null,
    pagamento,
    pagamentoStatus: "teste",
    testeAutomatico: true
  };
}

async function gerarPedidoTeste() {
  const telefone = telefoneTeste();
  if (!telefone) throw new Error("TEST_ORDER_PHONE não foi configurado.");
  const { pizzas, bebidas } = montarItensTeste();
  const recebimento = montarRecebimentoTeste(telefone);
  const pedido = criarPedidoPendente(telefone, pizzas, bebidas, recebimento.pagamento, "🧪 Pedido automático de teste");
  salvarEnderecoPedido(pedido.id, telefone, recebimento);
  const confirmado = confirmarPedidoTeste(pedido.id);
  const linhas = [...pizzas.map(item => `${item.quantidade}x ${item.sabor} ${item.tamanho}`), ...bebidas.map(item => `${item.quantidade}x ${item.nome}`)];
  await obterClienteWhatsApp().sendMessage(telefone, `🧪 *PEDIDO DE TESTE #${pedido.id}*\n\nModalidade: ${recebimento.modalidade}\nPagamento: ${recebimento.pagamento}\nItens: ${linhas.join(", ")}\n\nEste pedido é fictício e foi criado automaticamente para testar o painel.`);
  console.log(`[TESTE] Pedido fictício ${confirmado.id} criado para ${recebimento.modalidade}.`);
}

function iniciarPedidosTesteAutomaticos() {
  if (!habilitado()) return;
  if (temporizador) return;
  const intervaloMinutos = Math.max(1, Number(process.env.TEST_ORDER_INTERVAL_MINUTES || 1));
  if (!telefoneTeste()) {
    console.warn("[TESTE] TEST_ORDER_AUTOMATICO está ativo, mas TEST_ORDER_PHONE está vazio.");
    return;
  }
  const executar = () => gerarPedidoTeste().catch(erro => console.error("[TESTE] Falha ao gerar pedido automático:", erro.message));
  setTimeout(executar, 3000);
  temporizador = setInterval(executar, intervaloMinutos * 60 * 1000);
  console.log(`[TESTE] Pedidos automáticos ativos: a cada ${intervaloMinutos} minuto(s).`);
}

module.exports = { iniciarPedidosTesteAutomaticos };
