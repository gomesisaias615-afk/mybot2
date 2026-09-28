// As cópias WebP são geradas antecipadamente; não há conversão durante a requisição.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const manifest = require('./imagens-otimizadas.json');
const arquivos = new Map();
for (const [url, item] of Object.entries(manifest)) {
  try {
    const original = fs.readFileSync(path.join(__dirname, item.source));
    // Se a imagem original mudar, deixe a rota normal servir a nova versão.
    if (crypto.createHash('sha256').update(original).digest('hex') === item.sha256 &&
        fs.existsSync(path.join(__dirname, item.file))) {
      arquivos.set(url, path.join(__dirname, item.file));
    }
  } catch { /* O servidor continua funcionando sem a cópia otimizada. */ }
}
module.exports = function imagensOtimizadas(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const arquivo = arquivos.get(req.path);
  if (!arquivo) return next();
  res.vary('Accept');
  const aceitaWebp = (req.get('Accept') || '').split(',').some(item => {
    const [tipo, ...parametros] = item.trim().toLowerCase().split(';');
    const qualidade = parametros.find(p => p.trim().startsWith('q='));
    return tipo.trim() === 'image/webp' && (!qualidade || Number(qualidade.trim().slice(2)) > 0);
  });
  if (!aceitaWebp) return next();
  res.sendFile(arquivo, { maxAge: '1h', etag: true, lastModified: true }, erro => {
    if (erro) {
      if (res.headersSent) return next(erro);
      next();
    }
  });
};
