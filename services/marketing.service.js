const fs = require("fs");
const path = require("path");

const { garantirArquivo } = require("./dadosPersistentes.service");
const clientesPath = garantirArquivo("clientes.json", "data/clientes.json", []);

function lerClientes() {
  try {
    const clientes = JSON.parse(
      fs.readFileSync(clientesPath, "utf8")
    );

    if (!Array.isArray(clientes)) {
      return [];
    }

    return clientes;
  } catch {
    return [];
  }
}

function salvarClientes(clientes) {
  fs.writeFileSync(
    clientesPath,
    JSON.stringify(clientes, null, 2),
    "utf8"
  );
}

function normalizarClientes(clientes) {
  return clientes.map(cliente => {
    if (typeof cliente === "string") {
      return {
        chatId: cliente,
        contato: "",
        criadoEm: new Date().toISOString()
      };
    }

    return {
      chatId: cliente.chatId || cliente.numero || "",
      contato: cliente.contato || "",
      criadoEm: cliente.criadoEm || new Date().toISOString(),
      atualizadoEm: cliente.atualizadoEm || ""
    };
  }).filter(cliente => cliente.chatId);
}

function salvarCliente(chatId, contatoDigitado = "") {
  if (!chatId) {
    console.log("Cliente nao salvo: chatId vazio");
    return;
  }

  let clientes = normalizarClientes(lerClientes());

  const clienteExistente = clientes.find(cliente =>
    cliente.chatId === chatId
  );

  if (clienteExistente) {
    const contatoAtualizado =
      contatoDigitado || clienteExistente.contato || "";

    if (clienteExistente.contato === contatoAtualizado) {
      return;
    }

    clienteExistente.contato = contatoAtualizado;

    clienteExistente.atualizadoEm = new Date().toISOString();

    salvarClientes(clientes);

    console.log("Contato de marketing atualizado:", chatId);
    return;
  }

  clientes.push({
    chatId,
    contato: contatoDigitado || "",
    criadoEm: new Date().toISOString(),
    atualizadoEm: ""
  });

  salvarClientes(clientes);

  console.log("Contato de marketing salvo:", chatId);
}

function buscarContatoCliente(chatId) {
  const cliente = normalizarClientes(lerClientes()).find(item => item.chatId === chatId);
  return cliente?.contato || "";
}

function pegarNumeroCliente(cliente) {
  if (typeof cliente === "string") {
    return cliente;
  }

  return cliente.chatId || cliente.numero || "";
}

async function esperar(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

async function enviarPromocao(client, mensagem) {
  const clientes = normalizarClientes(lerClientes());

  for (const cliente of clientes) {
    const numero = pegarNumeroCliente(cliente);

    if (!numero) {
      continue;
    }

    try {
      await client.sendMessage(
        numero,
        mensagem
      );

      console.log("Mensagem enviada:", numero);

      await esperar(3000);
    } catch (err) {
      console.log(
        "Erro ao enviar:",
        numero,
        err.message
      );
    }
  }
}

async function enviarFotoPromocao(
  client,
  caminhoImagem,
  legenda
) {
  const clientes = normalizarClientes(lerClientes());

  const media = {
    __arquivo: path.resolve(caminhoImagem)
  };

  for (const cliente of clientes) {
    const numero = pegarNumeroCliente(cliente);

    if (!numero) {
      continue;
    }

    try {
      await client.sendMessage(
        numero,
        media,
        {
          caption: legenda || ""
        }
      );

      console.log("Foto enviada:", numero);

      await esperar(4000);
    } catch (err) {
      console.log(
        "Erro ao enviar foto:",
        numero,
        err.message
      );
    }
  }
}

module.exports = {
  salvarCliente,
  buscarContatoCliente,
  enviarPromocao,
  enviarFotoPromocao
};

