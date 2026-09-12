const fs = require("fs");
const path = require("path");
const { garantirArquivo, diretorioDados } = require("./dadosPersistentes.service");

const arquivo = garantirArquivo("identidade.json", "data/identidade.json", {});
const identidadeInicialPath = path.join(__dirname, "..", "data", "identidade.json");
const logo = path.join(diretorioDados, "identidade-logo.png");
const padrao = {
  nome: "Nova pizzaria",
  logo: "/cardapio/mascote-saborear.png",
  cores: {
    primaria: "#15965a",
    escura: "#0d3b2b",
    clara: "#effbf5",
    destaque: "#1eae67"
  }
};

function lerIdentidade() {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    return dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  } catch {
    return {};
  }
}

function lerIdentidadeInicial() {
  try {
    const dados = JSON.parse(fs.readFileSync(identidadeInicialPath, "utf8"));
    return dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  } catch {
    return {};
  }
}

function textoSeguro(valor, limite) {
  const texto = String(valor ?? "").trim();
  return texto && texto.length <= limite ? texto : "";
}

function coresSeguras(cores) {
  const atual = cores && typeof cores === "object" ? cores : {};
  const validar = valor => /^#[0-9a-f]{6}$/i.test(String(valor || "")) ? String(valor) : undefined;
  return Object.fromEntries(Object.entries({
    primaria: validar(atual.primaria),
    escura: validar(atual.escura),
    clara: validar(atual.clara),
    destaque: validar(atual.destaque)
  }).filter(([, valor]) => valor));
}

function obterIdentidade() {
  const inicial = lerIdentidadeInicial();
  const salva = lerIdentidade();
  const nomeEnv = textoSeguro(process.env.PIZZARIA_NOME, 80);
  const logoEnv = textoSeguro(process.env.PIZZARIA_LOGO, 2_000_000);
  return {
    ...padrao,
    ...inicial,
    ...salva,
    nome: nomeEnv || textoSeguro(salva.nome, 80) || padrao.nome,
    logo: logoEnv || textoSeguro(salva.logo, 2_000_000) || padrao.logo,
    cores: { ...padrao.cores, ...coresSeguras(inicial.cores), ...coresSeguras(salva.cores) }
  };
}

function atualizarIdentidade(dados = {}) {
  const atual = obterIdentidade();
  const proxima = {
    nome: textoSeguro(dados.nome, 80) || atual.nome,
    logo: textoSeguro(dados.logo, 2_000_000) || atual.logo,
    cores: { ...atual.cores, ...coresSeguras(dados.cores) }
  };
  fs.writeFileSync(arquivo, JSON.stringify(proxima, null, 2), "utf8");
  return proxima;
}

module.exports = { obterIdentidade, atualizarIdentidade, logo };
