function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function respostaSim(texto) {
  return ["1", "sim", "s", "ok"].includes(normalizar(texto));
}

function respostaNao(texto) {
  return ["2", "nao", "n"].includes(normalizar(texto));
}

module.exports = {
  normalizar,
  respostaSim,
  respostaNao
};


