const linkCardapioDigital =
  process.env.CARDAPIO_URL ||
  `${process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "https://mybotserver-k1w8.onrender.com"}/cardapio/?v=3`;
const instagramPizzaria = String(process.env.INSTAGRAM_URL || "").trim();
function limparLinkGrupo(valor) {
  const texto = String(valor || "").trim();
  // Links de grupo aceitam somente o código após chat.whatsapp.com. Remove
  // parâmetros de compartilhamento, texto colado por engano e espaços finais.
  const encontrado = texto.match(/https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/i);
  return encontrado ? encontrado[0] : texto;
}
const grupoWhatsApp = limparLinkGrupo(process.env.WHATSAPP_GROUP_URL);
const emailMyBot = process.env.MYBOT_EMAIL || "MyBot563@gmail.com";
const temInstagram = /^https?:\/\//i.test(instagramPizzaria);
const temGrupoPromocoes = /^https?:\/\//i.test(grupoWhatsApp);
const { obterIdentidade } = require("../services/identidade.service");
const nomePizzaria = obterIdentidade().nome;
const opcoesMenu = [
  "1️⃣ *Fazer pedido*",
  temInstagram ? "2️⃣ *Instagram*" : "",
  temGrupoPromocoes ? "3️⃣ *Ofertas*" : "",
  "4️⃣ *Contato MyBot*"
].filter(Boolean).join("\n");
module.exports = {
  linkCardapioDigital,

  // ================================
  // TEXTOS QUE PODEM MUDAR POR PIZZARIA
  // ================================

  menuInicial:
`🍔 *${nomePizzaria.toUpperCase()}* 🍔

Olá! 👋

Seja bem-vindo(a) à *${nomePizzaria}*!

🤖 *Eu sou o assistente virtual da hamburgueria*
e vou te atender por aqui.

🍔 *Vou te ajudar a fazer seu pedido*
de forma rápida e simples.

❤️ *Vamos começar?*

Escolha uma opção:

${opcoesMenu}

Digite o número ou toque em uma opção.

💡 A qualquer momento, digite *menu* para voltar ao início e reiniciar o pedido.`,

  localizacao:
`📍 Nossa localização...`,

  instagram:
`📸 *Instagram da hamburgueria*

Acompanhe nossas novidades e promoções:
${instagramPizzaria}`,

  grupoPromocoes: temGrupoPromocoes
    ? `📢 *Grupo oficial de promoções da ${nomePizzaria}*

Toque em *Ver grupo* no cartão abaixo para receber promoções e novidades:
${grupoWhatsApp}`
    : "",

  contatoMyBot:
`✉️ *Contato da MyBot*

E-mail: ${emailMyBot}
Link direto: mailto:${emailMyBot}`,

  problema:
`⚠️ Descreva o problema.`,

  atendente:
`👨‍💼 Aguarde um atendente.`,

  cardapioTitulo:
`🍔 CARDÁPIO DA HAMBURGUERIA
━━━━━━━━━━━━━━━━━━━`,

  comoPedirPizza:

`🍔 *COMO FAZER SEU PEDIDO*

📖 Acesse o *CARDÁPIO DIGITAL DA ${nomePizzaria.toUpperCase()}* pelo link abaixo.

Escolha hambúrgueres, acompanhamentos, combos e bebidas e, depois:

━━━━━━━━━━━━━━━━━━━━
📩 *ENVIE SEU PEDIDO AQUI NO CHAT*
━━━━━━━━━━━━━━━━━━━━

🤖 Nosso atendente virtual entenderá seu pedido e continuará o atendimento automaticamente.

✍️ *Digite seu pedido neste formato:*

📦 Quantidade → 🍔 Produto

💬 *Exemplos:*

\`2 Hambúrgueres X-Salada\`

\`1 Combo X-Bacon e 2 Batatas fritas\`

\`Quero 1 hambúrguer X-Bacon, 1 combo da casa, 1 nuggets e 2 refrigerantes.\`

✅ Você pode pedir um ou vários produtos na mesma mensagem.

🚀 *Acesse o CARDÁPIO DIGITAL pelo link enviado na próxima mensagem e faça seu pedido!*`,

  comoPedirBebidas:
`🥤 As bebidas também estão disponíveis no *CARDÁPIO DIGITAL*.

Consulte as opções pelo link e envie aqui somente a quantidade e o nome da bebida.

${linkCardapioDigital}`,
  perguntarBebida:
`🥤 Deseja adicionar uma bebida?

Uma bebida gelada combina perfeitamente com seu pedido 😋🍔

1️⃣ Sim
2️⃣ Não`,

   iniciarEndereco:
`╭━━━━━━━━━━━━━━━━━━━━╮
      📍 ENDEREÇO DE ENTREGA
╰━━━━━━━━━━━━━━━━━━━━╯

🍔 Antes de finalizar seu pedido,
precisamos do endereço para realizar a entrega.

📝 Vamos solicitar:

📞 Contato
🏠 Rua
🔢 Número
📍 Bairro
🏢 Complemento (Opcional)
📌 Ponto de Referência (Opcional)

━━━━━━━━━━━━━━━━━━━━

❓ *Deseja continuar?*

1️⃣ Sim, informar meu endereço

2️⃣ Não, cancelar

━━━━━━━━━━━━━━━━━━━━`,

  escolherPagamento:
`💳 Escolha a forma de pagamento:

1️⃣ PIX
2️⃣ Cartão`,

  pagamentoPix:
`💳 PIX selecionado

✅ Pagamento aprovado!`,

  pagamentoCartao:
`💳 Cartão selecionado

✅ Pagamento aprovado!`,

  // ================================
  // TEXTOS FIXOS DO FLUXO
  // ================================

  menuErro: `❌ Não entendi. Vou mostrar novamente as opções disponíveis.`,

  erroPedidoPizza:
`❌ Não foi possível processar seu pedido:`,

  exemploPizza:
`📌 Informe a quantidade e o produto.

Exemplos:
"Quero 2 hambúrgueres X-Salada e 1 combo da casa."
"Quero 1 batata frita, 1 nuggets e 2 refrigerantes."

Formato curto:
2 X-Salada e 1 Combo da casa`,

  dicaPizza:
`💡 Você pode escrever naturalmente; apenas informe quantidade e produto.`,

  confirmacaoPizzas:
`🛒 Carrinho:

`,

  confirmarPedido:
`

Deseja confirmar?
1️⃣ Sim
2️⃣ Não`,

  erroTamanhoPizza:
`❌ Informe a quantidade e o nome do produto.`,

  pizzaNaoEncontrada:
`❌ Pizza não encontrada no cardápio.`,

  quantidadeInvalida:
`❌ Quantidade inválida.`,

  erroEstoquePizza:
`❌ Alguns itens ficaram indisponíveis enquanto o pedido era processado.`,

  erroQuantidadePizza:
`❌ Poxa, esse sabor acabou de ficar indisponível no momento.

Temos poucas ou nenhuma unidade em estoque e não conseguimos confirmar essa quantidade agora.

Você pode escolher outro sabor ou pedir uma quantidade menor.`,

  erroPedidoBebida:
`❌ Não foi possível processar seu pedido:`,

  exemploBebidas:
`📌 Informe a quantidade e a bebida.

Exemplo:
"Quero duas Cocas e uma Água."

Formato curto:
2 Coca e 1 Água`,

  bebidaNaoEncontrada:
`❌ Bebida não encontrada no cardápio.`,

  confirmacaoBebidas:
`🛒 Carrinho:

`,

  erroEstoqueBebida:
`❌ Alguns itens ficaram indisponíveis enquanto o pedido era processado.`,

  erroQuantidadeBebida:
`❌ Poxa, essa bebida acabou de ficar indisponível no momento.

No momento não conseguimos confirmar essa quantidade em estoque.

Você pode escolher outra bebida ou pedir uma quantidade menor.`,

  resumoPedido:
`🧾 RESUMO DO PEDIDO`,

  continuarPedido:
`Deseja continuar?

1️⃣ Sim
2️⃣ Não`,

  pedirEnderecoCompleto:
`📍 Digite seu endereço completo seguindo esta ordem:

Rua:
Número:
Contato:
Bairro:
Complemento (opcional):`,

  pedirContato:
`📞 INFORME SEU CONTATO:`,

  confirmarContato:
`📞 CONTATO: {contato}

Está correto?
1️⃣ Sim
2️⃣ Não`,

  pedirRua:
`🏠 INFORME A RUA:`,

  confirmarRua:
`🏠 RUA: {rua}

Está correta?
1️⃣ Sim
2️⃣ Não`,

  pedirNumero:
`🔢 INFORME O NÚMERO:`,

  confirmarNumero:
`🔢 NÚMERO: {numero}

Está correto?
1️⃣ Sim
2️⃣ Não`,

  pedirBairro:
`📍 INFORME O BAIRRO:`,

  confirmarBairro:
`📍 BAIRRO: {bairro}

Está correto?
1️⃣ Sim
2️⃣ Não`,

   perguntarComplemento:
`🏢 DESEJA ADICIONAR COMPLEMENTO?

1️⃣ Sim
2️⃣ Não`,

  pedirComplemento:
`🏢 INFORME O COMPLEMENTO:`,

  perguntarReferencia:
`📌 DESEJA ADICIONAR UM PONTO DE REFERÊNCIA?

1️⃣ Sim
2️⃣ Não`,

  pedirReferencia:
`📌 INFORME O PONTO DE REFERÊNCIA:`,

  confirmarEnderecoFinal:
`📍 CONFIRME SEU ENDEREÇO:`,

  corrigirEndereco:
`📞 VAMOS CORRIGIR O ENDEREÇO.

INFORME NOVAAMENTE O CONTATO:`,

  pagamentoInvalido:
`❌ OPÇÃO INVÁLIDA

1️⃣ PIX
2️⃣ Cartão`,

  simOuNao:
`❌ NÃO ENTENDI.

Responda:
1️⃣ Sim
2️⃣ Não`,

  pedidoCancelado:
`❌ PEDIDO CANCELADO.`

};

