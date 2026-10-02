const test = require("node:test");
const assert = require("node:assert/strict");
const { validarEnderecoGeoapify } = require("./geoapify-enderecos");
const chave = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const endereco = {rua:"Rua Nova",bairro:"Centro",cidade:"Estância",estado:"SE",cep:"49200000"};
const resultado = {...endereco,latitude:-11.26,longitude:-37.44};
test("valida rua externa sem seleção, ignorando caixa e acentos", async () => {
  const encontrado = await validarEnderecoGeoapify({...endereco,rua:"RUA NOVA",cidade:"Estancia"},chave,async()=>[resultado]);
  assert.equal(encontrado,resultado);
});
test("não aceita ruas parecidas, bairro/cidade/CEP diferentes ou coordenadas inválidas", async () => {
  for (const mudanca of [{rua:"Rua Nova Dois"},{bairro:"Outro"},{cidade:"Aracaju"},{cep:"49000000"},{latitude:100}]) {
    assert.equal(await validarEnderecoGeoapify(endereco,chave,async()=>[{...resultado,...mudanca}]),null);
  }
});
test("não escolhe endereço ambíguo e não valida sem resultados", async () => {
  assert.equal(await validarEnderecoGeoapify(endereco,chave,async()=>[]),null);
  assert.equal(await validarEnderecoGeoapify(endereco,chave,async()=>[resultado,{...resultado,longitude:-37.45}]),null);
});
