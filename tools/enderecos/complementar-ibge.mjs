import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "../..");
const diretorio = resolve(import.meta.dirname, "dados/cnefe");
const arquivo = (await readdir(diretorio)).find(nome => nome.startsWith("2802106") && nome.endsWith(".csv"));
if (!arquivo) throw new Error("Baixe o CSV municipal de Estância do CNEFE/IBGE antes de executar.");
const destino = resolve(raiz, "site/data/enderecos-estancia.json");
const normalizar = texto => String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function lerCsv(texto) {
  const linhas = []; let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i];
    if (caractere === '"') {
      if (aspas && texto[i + 1] === '"') { campo += '"'; i++; }
      else aspas = !aspas;
    } else if (!aspas && caractere === ";") { linha.push(campo); campo = ""; }
    else if (!aspas && caractere === "\n") { linha.push(campo.replace(/\r$/, "")); linhas.push(linha); linha = []; campo = ""; }
    else campo += caractere;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const cabecalho = linhas.shift().map(valor => valor.replace(/^\uFEFF/, ""));
  return linhas.filter(linha => linha.length === cabecalho.length).map(linha => Object.fromEntries(cabecalho.map((nome, i) => [nome, linha[i]])));
}
const grupos = new Map();
const registros = lerCsv(await readFile(resolve(diretorio, arquivo), "utf8"));
for (const registro of registros) {
  if (registro.COD_MUNICIPIO !== "2802106" || !registro.NOM_SEGLOGR?.trim()) continue;
  const latitude = Number(registro.LATITUDE), longitude = Number(registro.LONGITUDE);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude >= 0 || longitude >= 0) continue;
  const rua = [registro.NOM_TIPO_SEGLOGR, registro.NOM_TITULO_SEGLOGR, registro.NOM_SEGLOGR].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (/sem nome|sem denominacao|nao informado/i.test(normalizar(rua))) continue;
  const localidade = registro.DSC_LOCALIDADE?.trim() || "";
  const chave = `${normalizar(rua)}|${normalizar(localidade)}`;
  const grupo = grupos.get(chave) || { rua, localidade, pontos: [], ceps: new Map() };
  grupo.pontos.push({ latitude, longitude });
  const cep = registro.CEP?.replace(/\D/g, "");
  if (cep?.length === 8) grupo.ceps.set(cep, (grupo.ceps.get(cep) || 0) + 1);
  grupos.set(chave, grupo);
}
const ibge = [...grupos.values()].map(grupo => {
  const mediana = valores => valores.sort((a, b) => a - b)[Math.floor(valores.length / 2)];
  const latitude = mediana(grupo.pontos.map(p => p.latitude));
  const longitude = mediana(grupo.pontos.map(p => p.longitude));
  // Escolhe um ponto observado, próximo da mediana, em vez de inventar uma
  // coordenada entre trechos desconectados ou entre ruas de mesmo nome.
  const ponto = grupo.pontos.reduce((melhor, atual) =>
    Math.hypot(atual.latitude - latitude, atual.longitude - longitude) < Math.hypot(melhor.latitude - latitude, melhor.longitude - longitude) ? atual : melhor);
  const cep = [...grupo.ceps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return { rua: grupo.rua, bairro: grupo.localidade, localidade: grupo.localidade,
    cidade: "Estância", estado: "Sergipe", uf: "SE", cep,
    ...ponto, fonte: "IBGE CNEFE Censo 2022", bairroTipo: "localidade_cnefe", coordenadaAproximada: true };
});
const anteriores = JSON.parse(await readFile(destino, "utf8"));
const nomesIbge = new Set(ibge.map(item => normalizar(item.rua)));
const preservados = anteriores.filter(item => !nomesIbge.has(normalizar(item.rua)));
const lista = [...ibge, ...preservados].sort((a, b) => a.rua.localeCompare(b.rua, "pt-BR") || a.bairro.localeCompare(b.bairro, "pt-BR"));
await writeFile(destino, JSON.stringify(lista) + "\n");
console.log(JSON.stringify({ registrosIbge: registros.length, entradasIbge: ibge.length, ruasIbge: nomesIbge.size, preservados: preservados.length, total: lista.length,
  casos: lista.filter(item => /maria.*lui.*santos|getulio vargas|gravata|joaquim souza/.test(normalizar(item.rua))).map(item => ({rua:item.rua,localidade:item.bairro,fonte:item.fonte})) }, null, 2));
