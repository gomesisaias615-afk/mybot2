const fs = require("fs");
const { garantirArquivo } = require("./dadosPersistentes.service");
const { salvarEnderecoPedido } = require("./enderecoPedido.service");

const ARQUIVO_PEDIDOS = garantirArquivo("pedidos.json", "services/monitoramento/relatorio/pedidos.json", []);
const PREFIXO = "VIDEO-";
const TELEFONE_DEMO = "5579988753038";

function lerPedidos() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO_PEDIDOS, "utf8")); } catch { return []; }
}

function criarPedidosDemonstracaoPersistentes() {
  const pedidos = lerPedidos();
  if (pedidos.some(pedido => String(pedido.id || "").startsWith(PREFIXO))) return false;
  const agora = Date.now();
  const criar = (numero, minutos, status, modalidade, nome, pizzas, pagamento = "pix") => {
    const criadoEm = new Date(agora - minutos * 60 * 1000).toISOString();
    const id = `${PREFIXO}${String(numero).padStart(3, "0")}`;
    const total = 48 + numero * 7;
    const recebimento = {
      cliente: TELEFONE_DEMO,
      nome,
      contato: TELEFONE_DEMO,
      modalidade,
      rua: modalidade === "entrega" ? "Rua de Demonstração" : "Não se aplica",
      numero: String(100 + numero),
      bairro: "Centro",
      cidade: "Estância",
      estado: "SE",
      cep: "49200000",
      complemento: numero % 2 ? "Casa" : "Apartamento",
      referencia: "Próximo à praça",
      taxaEntrega: modalidade === "entrega" ? 5 : 0,
      totalFinal: total,
      pagamento,
      pagamentoStatus: pagamento === "pix" ? "approved" : "confirmed"
    };
    salvarEnderecoPedido(id, TELEFONE_DEMO, recebimento);
    return {
      id,
      cliente: TELEFONE_DEMO,
      status,
      criadoEm,
      atualizadoEm: criadoEm,
      pagoEm: ["pago", "confirmado", "em_preparo", "pronto", "concluido"].includes(status) ? criadoEm : null,
      confirmadoEm: ["confirmado", "em_preparo", "pronto", "concluido"].includes(status) ? criadoEm : null,
      pizzas,
      bebidas: numero % 2 ? [{ quantidade: 1, nome: "Coca-Cola 2L", valor: 12 }] : [],
      total,
      observacaoPizzas: numero % 3 === 0 ? "Caprichar no recheio e cortar bem as fatias." : ""
    };
  };
  const novos = [
    criar(1, 2, "pago", "entrega", "Mariana Santos", [{ quantidade: 2, sabores: ["Calabresa"], sabor: "Calabresa", tamanho: "G", valor: 55 }]),
    criar(2, 6, "confirmado", "entrega", "Carlos Oliveira", [{ quantidade: 1, sabores: ["Portuguesa"], sabor: "Portuguesa", tamanho: "F", valor: 69 }], "maquininha"),
    criar(3, 11, "em_preparo", "entrega", "Ana Beatriz", [{ quantidade: 1, sabores: ["Marguerita"], sabor: "Marguerita", tamanho: "M", valor: 39 }]),
    criar(4, 18, "pronto", "entrega", "João Pedro", [{ quantidade: 1, sabores: ["Frango com Queijo"], sabor: "Frango com Queijo", tamanho: "G", valor: 55 }], "dinheiro"),
    criar(5, 27, "pago", "salao", "Mesa 07", [{ quantidade: 2, sabores: ["Quatro Queijos"], sabor: "Quatro Queijos", tamanho: "M", valor: 44 }], "maquininha"),
    criar(6, 34, "em_preparo", "salao", "Mesa 12", [{ quantidade: 1, sabores: ["Portuguesa"], sabor: "Portuguesa", tamanho: "F", valor: 69 }], "dinheiro"),
    criar(7, 3, "confirmado", "retirada", "Lucas Almeida", [{ quantidade: 1, sabores: ["Romeu e Julieta"], sabor: "Romeu e Julieta", tamanho: "G", valor: 42 }]),
    criar(8, 15, "pronto", "retirada", "Patrícia Costa", [{ quantidade: 1, sabores: ["Calabresa"], sabor: "Calabresa", tamanho: "F", valor: 69 }], "maquininha"),
    criar(9, 45, "concluido", "entrega", "Rafael Souza", [{ quantidade: 1, sabores: ["Muçarela"], sabor: "Muçarela", tamanho: "G", valor: 49 }]),
    criar(10, 65, "cancelado", "retirada", "Fernanda Lima", [{ quantidade: 1, sabores: ["Brigadeiro"], sabor: "Brigadeiro", tamanho: "M", valor: 39 }])
  ];
  fs.writeFileSync(ARQUIVO_PEDIDOS, JSON.stringify([...novos, ...pedidos], null, 2), "utf8");
  console.log(`[DEMO] ${novos.length} pedidos persistentes criados para o painel.`);
  return true;
}

module.exports = { criarPedidosDemonstracaoPersistentes };
