import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "../..");
const origem = resolve(raiz, "tools/enderecos/dados/estancia-ruas.geojson");
const destino = resolve(raiz, "site/data/cobertura-estancia.svg");
const area = { oeste: -37.518, sul: -11.348, leste: -37.358, norte: -11.188 };
const largura = 1200;
const altura = 900;
const margem = 58;

function projetar([longitude, latitude]) {
  const x = margem + ((longitude - area.oeste) / (area.leste - area.oeste)) * (largura - margem * 2);
  const y = altura - margem - ((latitude - area.sul) / (area.norte - area.sul)) * (altura - margem * 2);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function estiloDaVia(tipo) {
  if (["trunk", "primary", "primary_link", "tertiary", "tertiary_link"].includes(tipo)) return "principal";
  if (["residential", "unclassified", "living_street", "service"].includes(tipo)) return "rua";
  return "caminho";
}

const geojson = JSON.parse(await readFile(origem, "utf8"));
const vias = geojson.features
  .filter(feature => ["LineString", "MultiLineString"].includes(feature.geometry?.type) && feature.properties?.highway)
  .flatMap(feature => {
    const linhas = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return linhas.map(linha => ({ tipo: estiloDaVia(feature.properties.highway), pontos: linha.map(projetar).join(" ") }));
  });

const grupos = vias.reduce((resultado, via) => {
  (resultado[via.tipo] ||= []).push(via);
  return resultado;
}, {});
const linhasSvg = Object.entries(grupos)
  .map(([tipo, itens]) => `<g class="${tipo}">${itens.map(item => `<polyline points="${item.pontos}"/>`).join("")}</g>`)
  .join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Área de Estância mapeada para o MyBot">
  <style>
    .fundo { fill: #e9f2e8; } .area { fill: #fdfcf8; stroke: #e3342f; stroke-width: 4; stroke-dasharray: 14 10; }
    .caminho polyline { fill: none; stroke: #cbd4ca; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
    .rua polyline { fill: none; stroke: #9eaaa0; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .principal polyline { fill: none; stroke: #e99b22; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
    text { font-family: Arial, sans-serif; fill: #17311d; } .titulo { font-size: 30px; font-weight: 700; } .subtitulo { font-size: 17px; fill: #526458; }
    .legenda { font-size: 15px; fill: #435248; } .nota { font-size: 14px; fill: #617066; }
  </style>
  <rect class="fundo" width="${largura}" height="${altura}"/>
  <rect class="area" x="${margem}" y="${margem}" width="${largura - margem * 2}" height="${altura - margem * 2}" rx="4"/>
  ${linhasSvg}
  <rect x="${margem + 18}" y="${margem + 18}" width="520" height="100" rx="12" fill="#ffffff" fill-opacity="0.94"/>
  <text class="titulo" x="${margem + 36}" y="${margem + 56}">Área mapeada — Estância, SE</text>
  <text class="subtitulo" x="${margem + 36}" y="${margem + 86}">Recorte urbano + margem aproximada de 9 km</text>
  <rect x="${margem + 18}" y="${altura - margem - 86}" width="570" height="68" rx="10" fill="#ffffff" fill-opacity="0.94"/>
  <line x1="${margem + 38}" y1="${altura - margem - 61}" x2="${margem + 78}" y2="${altura - margem - 61}" stroke="#e99b22" stroke-width="4"/>
  <text class="legenda" x="${margem + 88}" y="${altura - margem - 56}">avenidas e vias principais</text>
  <line x1="${margem + 290}" y1="${altura - margem - 61}" x2="${margem + 330}" y2="${altura - margem - 61}" stroke="#9eaaa0" stroke-width="3"/>
  <text class="legenda" x="${margem + 340}" y="${altura - margem - 56}">ruas e travessas</text>
  <text class="nota" x="${margem + 38}" y="${altura - margem - 30}">Borda vermelha: limite usado na geração da lista local.</text>
</svg>`;

await writeFile(destino, svg, "utf8");
console.log(destino);
