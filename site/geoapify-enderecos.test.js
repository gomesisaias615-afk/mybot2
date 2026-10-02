const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buscarGeoapify, obterSugestaoGeoapify, juntarSugestoes } = require("./geoapify-enderecos");

test("consulta, filtra município, agrupa requisições e confirma seleção", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEOAPIFY_API_KEY;
  process.env.GEOAPIFY_API_KEY = "chave-de-teste";
  let chamadas = 0;
  global.fetch = async url => {
    chamadas++;
    assert.equal(url.hostname, "api.geoapify.com");
    assert.equal(url.searchParams.get("apiKey"), "chave-de-teste");
    assert.equal(url.searchParams.get("type"), "street");
    return { ok: true, json: async () => ({ results: [
      { place_id: "teste", street: "Rua Nova", suburb: "Centro", city: "Estância", state_code: "SE", country_code: "br", lat: -11.26, lon: -37.44 },
      { street: "Rua Outra", city: "Aracaju", state: "Sergipe", country_code: "br", lat: -10.9, lon: -37.0 },
      { street: "Rua Inválida", city: "Estância", state: "Sergipe", country_code: "br", lat: null, lon: null }
    ] }) };
  };
  try {
    const [a, b] = await Promise.all([buscarGeoapify("Rua Nova"), buscarGeoapify("Rua Nova")]);
    assert.equal(a.length, 1);
    assert.deepEqual(a, b);
    await buscarGeoapify("rua nova");
    assert.equal(chamadas, 1);
    assert.equal(obterSugestaoGeoapify(a[0].placeId).latitude, -11.26);
    assert.equal(obterSugestaoGeoapify("geoapify:inexistente"), null);
    global.fetch = async () => { throw new Error("falha simulada"); };
    assert.deepEqual(await buscarGeoapify("Rua indisponível"), []);
    delete process.env.GEOAPIFY_API_KEY;
    assert.deepEqual(await buscarGeoapify("Rua sem chave"), []);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEOAPIFY_API_KEY;
    else process.env.GEOAPIFY_API_KEY = originalKey;
  }
});

test("remove repetidas, preserva outra localidade e resultados locais em falha", () => {
  const chave = texto => texto.toLowerCase();
  const local = { rua: "Rua Nova", bairro: "Centro" };
  const externas = [{ rua: "RUA NOVA", bairro: "CENTRO" }, { rua: "Rua Nova", bairro: "São Jorge" }];
  assert.deepEqual(juntarSugestoes([local], externas, chave), [local, externas[1]]);
  assert.deepEqual(juntarSugestoes([local], [], chave), [local]);
});
