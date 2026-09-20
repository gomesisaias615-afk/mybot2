const fs = require("fs");
const { garantirArquivo } = require("./dadosPersistentes.service");

const arquivo = garantirArquivo("inatividadeAtendimentos.json", null, {});
const LIMITE_INATIVIDADE = 12 * 60 * 60 * 1000;

function registrarEVerificarInatividade(user) {
  let dados = {};
  try { dados = JSON.parse(fs.readFileSync(arquivo, "utf8")) || {}; } catch {}
  const agora = Date.now();
  const expirou = Boolean(dados[user] && agora - Number(dados[user]) >= LIMITE_INATIVIDADE);
  dados[user] = agora;
  try { fs.writeFileSync(arquivo, JSON.stringify(dados), "utf8"); } catch {}
  return expirou;
}

module.exports = { registrarEVerificarInatividade };
