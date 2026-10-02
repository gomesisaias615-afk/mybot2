function normalizar(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nomesEndereco(item) {
  return [item.rua || item.logradouro || "", ...(Array.isArray(item.aliases) ? item.aliases : [])];
}

function aplicarRenomeacoes(catalogo, renomeacoes) {
  const resultado = catalogo.map(item => ({ ...item }));
  for (const registro of renomeacoes) {
    const candidatos = resultado.filter(item =>
      nomesEndereco(item).some(nome => normalizar(nome) === normalizar(registro.nomeAnterior)) &&
      normalizar(item.bairro) === normalizar(registro.localidadeAnterior));
    // Não transfere coordenadas entre localidades nem escolhe entre homônimos.
    if (candidatos.length !== 1 || !registro.rua) continue;
    const item = candidatos[0];
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) continue;
    item.aliases = [...new Set([...nomesEndereco(item), ...(registro.aliases || [])])]
      .filter(nome => normalizar(nome) !== normalizar(registro.rua));
    item.rua = registro.rua;
    item.leiDenominacao = registro.lei;
    item.fonteDenominacao = registro.fonte;
    item.coordenadaAproximada = true;
    item.origemCoordenada = "Ponto da via antiga na mesma localidade; vinculação pela denominação municipal";
  }
  return resultado;
}

module.exports = { aplicarRenomeacoes, nomesEndereco };
