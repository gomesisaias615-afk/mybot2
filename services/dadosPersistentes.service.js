const fs = require("fs");
const path = require("path");
const raizProjeto = path.resolve(__dirname, "..");
const diretorioDados = path.resolve(process.env.BOT_DATA_DIR || (process.env.RENDER ? "/var/data" : path.join(__dirname, "monitoramento", "relatorio")));
function garantirArquivo(nome, origemRelativa, padrao) {
  fs.mkdirSync(diretorioDados, { recursive: true });
  const destino = path.join(diretorioDados, nome);
  if (fs.existsSync(destino)) return destino;
  const origem = origemRelativa ? path.join(raizProjeto, origemRelativa) : null;
  if (origem && fs.existsSync(origem)) fs.copyFileSync(origem, destino);
  else fs.writeFileSync(destino, JSON.stringify(padrao, null, 2), "utf8");
  return destino;
}
module.exports = { diretorioDados, garantirArquivo };

