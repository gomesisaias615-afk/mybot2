const TRECHOS_ERRO_TRANSITORIO = [
  "execution context was destroyed",
  "cannot find context with specified id",
  "most likely because of a navigation"
];

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function erroTransitorioNavegador(erro) {
  const mensagem = String(erro?.message || erro || "").toLowerCase();
  return TRECHOS_ERRO_TRANSITORIO.some(trecho => mensagem.includes(trecho));
}

async function executarComRetry(
  operacao,
  { tentativas = 3, atrasoMs = 1200, aoRepetir = () => {} } = {}
) {
  let ultimoErro;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await operacao();
    } catch (erro) {
      ultimoErro = erro;

      if (!erroTransitorioNavegador(erro) || tentativa === tentativas) {
        throw erro;
      }

      const espera = atrasoMs * tentativa;
      aoRepetir({ erro, tentativa, proximaTentativa: tentativa + 1, espera });
      await esperar(espera);
    }
  }

  throw ultimoErro;
}

function protegerResposta(msg) {
  if (!msg || typeof msg.reply !== "function" || msg.__respostaSegura) {
    return msg;
  }

  const responderOriginal = msg.reply.bind(msg);

  msg.reply = async (...args) => {
    const respostaIa = String(args[0] || "").trim().startsWith("```");
    if (!respostaIa) await esperar(2000);
    return executarComRetry(
      () => responderOriginal(...args),
      {
        aoRepetir: ({ proximaTentativa, espera }) => {
          console.warn(
            `WhatsApp recarregou durante o envio. Tentativa ${proximaTentativa}/3 em ${espera}ms.`
          );
        }
      }
    );
  };

  Object.defineProperty(msg, "__respostaSegura", {
    value: true,
    enumerable: false
  });

  return msg;
}

module.exports = {
  erroTransitorioNavegador,
  executarComRetry,
  protegerResposta
};


