let clienteAtivo = null;

function definirClienteWhatsApp(cliente) {
  clienteAtivo = cliente || null;
}

function obterClienteWhatsApp() {
  if (!clienteAtivo || typeof clienteAtivo.sendMessage !== "function") {
    throw new Error("Cliente do WhatsApp ainda não está disponível.");
  }
  return clienteAtivo;
}

module.exports = { definirClienteWhatsApp, obterClienteWhatsApp };


