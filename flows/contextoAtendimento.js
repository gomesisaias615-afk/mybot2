const fs = require("fs");
const { garantirArquivo } = require("../services/dadosPersistentes.service");

const arquivo = garantirArquivo("atendimentos-ativos.json", null, {});
const mapa = valor => valor && typeof valor === "object" && !Array.isArray(valor) ? valor : Object.create(null);

function carregar() {
  try { return JSON.parse(fs.readFileSync(arquivo, "utf8")) || {}; }
  catch { return {}; }
}

const salvo = carregar();
const contexto = {
  estados: mapa(salvo.estados),
  carrinhoPizza: mapa(salvo.carrinhoPizza),
  carrinhoBebida: mapa(salvo.carrinhoBebida),
  observacoesPizza: mapa(salvo.observacoesPizza),
  adicionais: mapa(salvo.adicionais),
  adicionaisPendentes: mapa(salvo.adicionaisPendentes),
  adicionaisDisponiveis: mapa(salvo.adicionaisDisponiveis),
  enderecos: mapa(salvo.enderecos),
  pagamentos: mapa(salvo.pagamentos)
};

function salvarContexto() {
  try { fs.writeFileSync(arquivo, JSON.stringify(contexto), "utf8"); }
  catch (erro) { console.error("Não foi possível salvar o atendimento:", erro.message); }
}

function resetarUsuario(user) {
  for (const dados of Object.values(contexto)) delete dados[user];
  salvarContexto();
}

function resetarTodosUsuarios() {
  const usuarios = new Set(Object.values(contexto).flatMap(dados => Object.keys(dados)));
  for (const dados of Object.values(contexto)) for (const user of Object.keys(dados)) delete dados[user];
  salvarContexto();
  return usuarios.size;
}

module.exports = { contexto, resetarUsuario, resetarTodosUsuarios, salvarContexto };
