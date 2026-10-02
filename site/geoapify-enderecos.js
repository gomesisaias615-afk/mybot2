const cache = new Map();
const selecionaveis = new Map();
const emAndamento = new Map();
const TTL = 10 * 60 * 1000;
const normalizar = valor => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function limitar(mapa) {
  while (mapa.size > 500) mapa.delete(mapa.keys().next().value);
}

function converter(item) {
  const cidade = item.city || item.town || item.county || "";
  const estado = normalizar(item.state_code || item.state);
  if (normalizar(cidade) !== "estancia" || !["se", "br-se", "sergipe"].includes(estado) || item.country_code !== "br") return null;
  if (!item.street || !Number.isFinite(item.lat) || !Number.isFinite(item.lon) || Math.abs(item.lat) > 90 || Math.abs(item.lon) > 180) return null;
  const bairro = item.suburb || item.district || item.quarter || item.neighbourhood || "";
  return {
    placeId: `geoapify:${item.place_id || `${item.lat},${item.lon}`}`,
    rua: item.street, logradouro: item.street, numero: item.housenumber || "",
    bairro, cidade: "Estância", estado: "SE",
    cep: String(item.postcode || "").replace(/\D/g, ""),
    latitude: item.lat, longitude: item.lon, fonte: "geoapify",
    atribuicao: "Powered by Geoapify | © OpenStreetMap contributors"
  };
}

async function buscarGeoapify(busca) {
  const chaveApi = String(process.env.GEOAPIFY_API_KEY || "").trim();
  if (!chaveApi || busca.length < 3 || busca.length > 160) return [];
  const chave = normalizar(busca);
  const anterior = cache.get(chave);
  if (anterior?.expira > Date.now()) return anterior.dados;
  if (emAndamento.has(chave)) return emAndamento.get(chave);
  const consulta = (async () => {
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.search = new URLSearchParams({ text: `${busca}, Estância, Sergipe, Brasil`,
      filter: "countrycode:br", bias: "proximity:-37.4484,-11.2659", lang: "pt",
      format: "json", type: "street", limit: "8", apiKey: chaveApi }).toString();
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const json = await resposta.json();
      if (!Array.isArray(json.results)) throw new Error("Resposta inválida");
      const dados = json.results.map(converter).filter(Boolean);
      cache.set(chave, { dados, expira: Date.now() + TTL });
      limitar(cache);
      for (const item of dados) selecionaveis.set(item.placeId, { item, expira: Date.now() + 60 * 60 * 1000 });
      limitar(selecionaveis);
      return dados;
    } catch {
      // Nunca registra URL ou chave. Falhas não interrompem a busca local.
      console.warn("Geoapify indisponível; mantendo sugestões locais.");
      cache.set(chave, { dados: [], expira: Date.now() + 30000 });
      limitar(cache);
      return [];
    }
  })();
  emAndamento.set(chave, consulta);
  try { return await consulta; } finally { emAndamento.delete(chave); }
}

function obterSugestaoGeoapify(placeId) {
  const salvo = selecionaveis.get(String(placeId || ""));
  return salvo?.expira > Date.now() ? salvo.item : null;
}

function juntarSugestoes(locais, externas, chaveEndereco) {
  const resultado = [...locais];
  for (const externa of externas) {
    const repetida = resultado.some(local => chaveEndereco(local.rua) === chaveEndereco(externa.rua)
      && (!local.bairro || !externa.bairro || chaveEndereco(local.bairro) === chaveEndereco(externa.bairro)));
    if (!repetida) resultado.push(externa);
  }
  return resultado.slice(0, 16);
}

module.exports = { buscarGeoapify, obterSugestaoGeoapify, juntarSugestoes };
