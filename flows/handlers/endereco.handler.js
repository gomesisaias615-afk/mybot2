const textos = require("../textosFlows");
const { respostaSim, respostaNao } = require("../../utils/texto");

const ESTADOS_ENDERECO = new Set([
  "endereco_inicio",
  "endereco_contato",
  "conf_contato",
  "endereco_rua",
  "conf_rua",
  "endereco_numero",
  "conf_numero",
  "endereco_bairro",
  "conf_bairro",
  "complemento_pergunta",
  "endereco_complemento",
  "referencia_pergunta",
  "endereco_referencia",
  "confirmar_endereco"
]);

function resumoEndereco(endereco = {}) {
  return (
    "📍 RESUMO DO ENDEREÇO\n" +
    "━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    `📞 Contato: ${endereco.contato || ""}\n` +
    `🏠 Rua: ${endereco.rua || ""}\n` +
    `🔢 Número: ${endereco.numero || ""}\n` +
    `📍 Bairro: ${endereco.bairro || ""}\n` +
    `➕ Complemento: ${endereco.complemento || "Sem complemento"}\n` +
    `📌 Referência: ${endereco.referencia || "Sem referência"}\n\n` +
    "━━━━━━━━━━━━━━━━━━━━━━\n" +
    "Está tudo correto?\n\n" +
    "1️⃣ Sim, continuar para pagamento\n" +
    "2️⃣ Não, corrigir endereço"
  );
}

async function confirmarOuCorrigir({
  msg,
  user,
  contexto,
  proximoEstado,
  textoProximo,
  estadoCorrecao,
  textoCorrecao
}) {
  if (respostaSim(msg.body)) {
    contexto.estados[user] = proximoEstado;
    await msg.reply(textoProximo);
    return;
  }

  if (respostaNao(msg.body)) {
    contexto.estados[user] = estadoCorrecao;
    await msg.reply(textoCorrecao);
    return;
  }

  await msg.reply(textos.simOuNao);
}

async function tratarEndereco({
  msg,
  user,
  contexto,
  resetarUsuario,
  mostrarMenu
}) {
  const estado = contexto.estados[user];

  if (!ESTADOS_ENDERECO.has(estado)) {
    return false;
  }

  const endereco = contexto.enderecos[user] ||= {};

  if (estado === "endereco_inicio") {
    if (respostaSim(msg.body)) {
      contexto.estados[user] = "endereco_contato";
      await msg.reply(textos.pedirContato);
    } else if (respostaNao(msg.body)) {
      resetarUsuario(user);
      await msg.reply(textos.pedidoCancelado);
      await mostrarMenu(msg, user);
    } else {
      await msg.reply(textos.simOuNao);
    }
    return true;
  }

  if (estado === "endereco_contato") {
    endereco.contato = msg.body;
    contexto.estados[user] = "conf_contato";
    await msg.reply(
      textos.confirmarContato.replace("{contato}", msg.body)
    );
    return true;
  }

  if (estado === "conf_contato") {
    await confirmarOuCorrigir({
      msg,
      user,
      contexto,
      proximoEstado: "endereco_rua",
      textoProximo: textos.pedirRua,
      estadoCorrecao: "endereco_contato",
      textoCorrecao: textos.pedirContato
    });
    return true;
  }

  if (estado === "endereco_rua") {
    endereco.rua = msg.body;
    contexto.estados[user] = "conf_rua";
    await msg.reply(textos.confirmarRua.replace("{rua}", msg.body));
    return true;
  }

  if (estado === "conf_rua") {
    await confirmarOuCorrigir({
      msg,
      user,
      contexto,
      proximoEstado: "endereco_numero",
      textoProximo: textos.pedirNumero,
      estadoCorrecao: "endereco_rua",
      textoCorrecao: textos.pedirRua
    });
    return true;
  }

  if (estado === "endereco_numero") {
    endereco.numero = msg.body;
    contexto.estados[user] = "conf_numero";
    await msg.reply(
      textos.confirmarNumero.replace("{numero}", msg.body)
    );
    return true;
  }

  if (estado === "conf_numero") {
    await confirmarOuCorrigir({
      msg,
      user,
      contexto,
      proximoEstado: "endereco_bairro",
      textoProximo: textos.pedirBairro,
      estadoCorrecao: "endereco_numero",
      textoCorrecao: textos.pedirNumero
    });
    return true;
  }

  if (estado === "endereco_bairro") {
    endereco.bairro = msg.body;
    contexto.estados[user] = "conf_bairro";
    await msg.reply(
      textos.confirmarBairro.replace("{bairro}", msg.body)
    );
    return true;
  }

  if (estado === "conf_bairro") {
    await confirmarOuCorrigir({
      msg,
      user,
      contexto,
      proximoEstado: "complemento_pergunta",
      textoProximo: textos.perguntarComplemento,
      estadoCorrecao: "endereco_bairro",
      textoCorrecao: textos.pedirBairro
    });
    return true;
  }

  if (estado === "complemento_pergunta") {
    if (respostaSim(msg.body)) {
      contexto.estados[user] = "endereco_complemento";
      await msg.reply(textos.pedirComplemento);
    } else if (respostaNao(msg.body)) {
      endereco.complemento = "Sem complemento";
      contexto.estados[user] = "referencia_pergunta";
      await msg.reply(textos.perguntarReferencia);
    } else {
      await msg.reply(textos.simOuNao);
    }
    return true;
  }

  if (estado === "endereco_complemento") {
    endereco.complemento = msg.body;
    contexto.estados[user] = "referencia_pergunta";
    await msg.reply(textos.perguntarReferencia);
    return true;
  }

  if (estado === "referencia_pergunta") {
    if (respostaSim(msg.body)) {
      contexto.estados[user] = "endereco_referencia";
      await msg.reply(textos.pedirReferencia);
    } else if (respostaNao(msg.body)) {
      endereco.referencia = "Sem referência";
      contexto.estados[user] = "confirmar_endereco";
      await msg.reply(resumoEndereco(endereco));
    } else {
      await msg.reply(textos.simOuNao);
    }
    return true;
  }

  if (estado === "endereco_referencia") {
    endereco.referencia = msg.body;
    contexto.estados[user] = "confirmar_endereco";
    await msg.reply(resumoEndereco(endereco));
    return true;
  }

  if (respostaSim(msg.body)) {
    contexto.estados[user] = "pagamento_tipo";
    await msg.reply(textos.escolherPagamento);
  } else if (respostaNao(msg.body)) {
    contexto.estados[user] = "endereco_contato";
    await msg.reply(textos.corrigirEndereco);
  } else {
    await msg.reply(textos.simOuNao);
  }

  return true;
}

module.exports = {
  tratarEndereco
};

