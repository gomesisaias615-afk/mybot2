const test = require("node:test");
const assert = require("node:assert/strict");
const { aplicarRenomeacoes, nomesEndereco } = require("./renomeacoes-enderecos");

test("quatro denominações preservam coordenadas e nomes antigos sem duplicar registros", () => {
  const base = require("./data/enderecos-estancia.json");
  const registros = require("./data/renomeacoes-estancia.json");
  const resultado = aplicarRenomeacoes(base, registros);
  assert.equal(resultado.length, base.length);
  for (const registro of registros) {
    const original = base.find(item => item.rua === registro.nomeAnterior && item.bairro === registro.localidadeAnterior);
    const novo = resultado.find(item => item.rua === registro.rua && item.bairro === registro.localidadeAnterior);
    assert.ok(original);
    assert.ok(novo);
    assert.equal(novo.latitude, original.latitude);
    assert.equal(novo.longitude, original.longitude);
    assert.ok(nomesEndereco(novo).includes(registro.nomeAnterior));
    assert.equal(original.rua, registro.nomeAnterior);
  }
  assert.deepEqual(aplicarRenomeacoes(resultado, registros), resultado);
});

test("não renomeia em outra localidade, com coordenadas ausentes ou ligação ambígua", () => {
  const regra = [{ nomeAnterior: "Rua A", localidadeAnterior: "Centro", rua: "Rua Nova" }];
  const base = [{ rua: "Rua A", bairro: "Outro", latitude: -11, longitude: -37 }];
  assert.deepEqual(aplicarRenomeacoes(base, regra), base);
  const ambiguos = [1, 2].map(latitude => ({ rua: "Rua A", bairro: "Centro", latitude, longitude: -37 }));
  assert.deepEqual(aplicarRenomeacoes(ambiguos, regra), ambiguos);
  const semPonto = [{ rua: "Rua A", bairro: "Centro", latitude: null, longitude: null }];
  assert.deepEqual(aplicarRenomeacoes(semPonto, regra), semPonto);
});
