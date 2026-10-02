import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const raiz = resolve(import.meta.dirname, "../..");
const origem = resolve(raiz, "tools/enderecos/dados/estancia-ruas.geojson");
const origemBairros = resolve(raiz, "tools/enderecos/dados/estancia-bairros.geojson");
const destino = resolve(raiz, "site/data/enderecos-estancia.json");
const cidade = {
  nome: "Estância",
  estado: "Sergipe",
  uf: "SE",
  cep: "49200-000"
};

const tiposDeVia = new Set([
  "living_street", "pedestrian", "primary", "primary_link", "residential",
  "path", "secondary", "secondary_link", "service", "tertiary", "tertiary_link",
  "trunk", "trunk_link", "unclassified"
]);

function executar(comando, argumentos, entrada = "") {
  return new Promise((resolvePromise, reject) => {
    const processo = spawn(comando, argumentos, { stdio: ["pipe", "pipe", "pipe"] });
    let erro = "";
    processo.stderr.on("data", dados => { erro += dados; });
    processo.on("error", reject);
    processo.on("close", codigo => {
      if (codigo === 0) return resolvePromise();
      reject(new Error(erro.trim() || `${comando} terminou com código ${codigo}.`));
    });
    processo.stdin.end(entrada);
  });
}

function escaparCsv(valor) {
  return `"${String(valor ?? "").replaceAll('"', '""')}"`;
}

function pontoMedio(geometry) {
  const linhas = geometry?.type === "LineString"
    ? [geometry.coordinates]
    : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
  const pontos = linhas.flat().filter(ponto =>
    Array.isArray(ponto) && Number.isFinite(ponto[0]) && Number.isFinite(ponto[1])
  );
  if (!pontos.length) return null;
  const [longitude, latitude] = pontos[Math.floor(pontos.length / 2)];
  return { latitude, longitude };
}

function pontoDoBairro(geometry) {
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return null;
  const [longitude, latitude] = geometry.coordinates;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function distanciaEmKm(a, b) {
  const raioTerra = 6371;
  const paraRadiano = graus => graus * Math.PI / 180;
  const latitude = paraRadiano(b.latitude - a.latitude);
  const longitude = paraRadiano(b.longitude - a.longitude);
  const calculo = Math.sin(latitude / 2) ** 2 + Math.cos(paraRadiano(a.latitude)) * Math.cos(paraRadiano(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * raioTerra * Math.asin(Math.sqrt(calculo));
}

async function carregarBairros() {
  const dados = JSON.parse(await readFile(origemBairros, "utf8"));
  return (dados.features || []).map(feature => {
    const nome = String(feature.properties?.name || "").trim();
    const ponto = pontoDoBairro(feature.geometry);
    return nome && ponto ? { nome, ...ponto } : null;
  }).filter(Boolean);
}

function bairroMaisProximo(rua, bairros) {
  let melhor;
  for (const bairro of bairros) {
    const distancia = distanciaEmKm(rua, bairro);
    if (!melhor || distancia < melhor.distancia) melhor = { ...bairro, distancia };
  }
  // Pontos de bairro não são fronteiras. Acima de 4 km, não rotulamos a rua
  // para evitar atribuir um bairro incorreto em áreas rurais ou de borda.
  return melhor?.distancia <= 4 ? melhor.nome : "";
}

async function organizarRuas() {
  const dados = JSON.parse(await readFile(origem, "utf8"));
  const bairros = await carregarBairros();
  if (!Array.isArray(dados.features)) throw new Error("O arquivo de vias não está no formato GeoJSON esperado.");
  const ruas = new Map();
  for (const item of dados.features) {
    const tags = item.properties || {};
    const nome = String(tags.name || "").trim();
    const ponto = pontoMedio(item.geometry);
    if (!nome || !tiposDeVia.has(tags.highway) || !ponto) continue;
    const chave = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const atual = ruas.get(chave) || { nome, latitude: 0, longitude: 0, quantidade: 0, bairro: "" };
    atual.latitude += ponto.latitude;
    atual.longitude += ponto.longitude;
    atual.quantidade += 1;
    atual.bairro ||= String(tags["addr:suburb"] || tags.suburb || tags["is_in:suburb"] || "").trim();
    ruas.set(chave, atual);
  }
  return [...ruas.values()]
    .map(rua => {
      const latitude = Number((rua.latitude / rua.quantidade).toFixed(6));
      const longitude = Number((rua.longitude / rua.quantidade).toFixed(6));
      return {
      rua: rua.nome,
      bairro: rua.bairro || bairroMaisProximo({ latitude, longitude }, bairros),
      cidade: cidade.nome,
      estado: cidade.estado,
      uf: cidade.uf,
      cep: cidade.cep,
      latitude,
      longitude
    };
    })
    .sort((a, b) => a.rua.localeCompare(b.rua, "pt-BR"));
}

async function gravarNoPostgis(ruas) {
  const cabecalho = "rua,bairro,cidade,uf,cep,latitude,longitude";
  const linhas = ruas.map(item => [item.rua, item.bairro, item.cidade, item.uf, item.cep, item.latitude, item.longitude]
    .map(escaparCsv).join(","));
  const sql = `CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS enderecos_estancia (
  rua text NOT NULL, bairro text, cidade text NOT NULL, uf char(2) NOT NULL,
  cep text, latitude double precision NOT NULL, longitude double precision NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);
ALTER TABLE enderecos_estancia ALTER COLUMN geom DROP NOT NULL;
TRUNCATE enderecos_estancia;
COPY enderecos_estancia (rua, bairro, cidade, uf, cep, latitude, longitude) FROM STDIN WITH (FORMAT csv, HEADER true);
${cabecalho}\n${linhas.join("\n")}
\\.
UPDATE enderecos_estancia SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);
ALTER TABLE enderecos_estancia ALTER COLUMN geom SET NOT NULL;
CREATE INDEX IF NOT EXISTS enderecos_estancia_geom_idx ON enderecos_estancia USING GIST (geom);
`;
  await executar("docker", ["exec", "-i", "mybot-postgis", "psql", "-v", "ON_ERROR_STOP=1", "-U", "mybot", "-d", "enderecos"], sql);
}

const ruas = await organizarRuas();
if (!ruas.length) throw new Error("Os dados recebidos não continham ruas com coordenadas.");
await gravarNoPostgis(ruas);
await mkdir(dirname(destino), { recursive: true });
await writeFile(destino, `${JSON.stringify(ruas, null, 2)}\n`, "utf8");
console.log(`Lista de Estância criada: ${ruas.length} ruas em ${destino}`);
