const fs=require("fs"); const path=require("path"); const { garantirArquivo }=require("./dadosPersistentes.service");
const pizzasPath=garantirArquivo("precospizzas.json","data/precospizzas.json",{}), bebidasPath=garantirArquivo("precosbebidas.json","data/precosbebidas.json",{}), combosPath=garantirArquivo("precoscombos.json","data/precoscombos.json",{}), promosPath=garantirArquivo("promocoes.json",null,{pizzas:{},bebidas:{}}), nomesPath=garantirArquivo("nomesbebidas.json","data/nomesbebidas.json",{}), nomesCombosPath=garantirArquivo("nomescombos.json","data/nomescombos.json",{}), ingredientesPath=garantirArquivo("ingredientespizzas.json",null,{}), configuracaoPath=garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{});
const ler=(p,d)=>{try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return d}}, salvar=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2),"utf8"), valido=v=>Number.isFinite(Number(v))&&Number(v)>=.01&&Number(v)<=5000, n=v=>Number(Number(v).toFixed(2));
const pastaDadosIniciais=path.resolve(__dirname,"..","data");
function mesclarDados(inicial,atual){
  if(Array.isArray(inicial)&&Array.isArray(atual))return [...new Set([...inicial,...atual])];
  if(!inicial||typeof inicial!=="object"||Array.isArray(inicial))return atual===undefined?inicial:atual;
  const resultado={...inicial};
  for(const [chave,valor] of Object.entries(atual&&typeof atual==="object"?atual:{}))resultado[chave]=Object.prototype.hasOwnProperty.call(inicial,chave)?mesclarDados(inicial[chave],valor):valor;
  return resultado;
}
function sincronizarArquivoInicial(nome,destino,padrao={}){
  const inicial=ler(path.join(pastaDadosIniciais,nome),padrao), atual=ler(destino,padrao), combinado=mesclarDados(inicial,atual);
  if(JSON.stringify(atual)!==JSON.stringify(combinado))salvar(destino,combinado);
}
// No Render, os dados vivem em disco persistente. Esta sincronização acrescenta
// novidades do catálogo publicado sem sobrescrever preços ou ajustes já feitos no painel.
sincronizarArquivoInicial("precospizzas.json",pizzasPath);
sincronizarArquivoInicial("precosbebidas.json",bebidasPath);
sincronizarArquivoInicial("precoscombos.json",combosPath);
sincronizarArquivoInicial("nomesbebidas.json",nomesPath);
sincronizarArquivoInicial("nomescombos.json",nomesCombosPath);
sincronizarArquivoInicial("ingredientespizzas.json",ingredientesPath);
sincronizarArquivoInicial("promocoes.json",promosPath,{pizzas:{},bebidas:{}});
sincronizarArquivoInicial("configuracaoCardapio.json",configuracaoPath);
function catalogo(){return {pizzas:ler(pizzasPath,{}),bebidas:ler(bebidasPath,{}),combos:ler(combosPath,{}),nomesBebidas:ler(nomesPath,{}),nomesCombos:ler(nomesCombosPath,{}),ingredientesPizzas:ler(ingredientesPath,{}),promocoes:ler(promosPath,{pizzas:{},bebidas:{}})}}
function ativa(p){return Boolean(p&&p.ativa!==false&&valido(p.por))}
function obterPrecosPizzas(){const c=catalogo();return Object.fromEntries(Object.entries(c.pizzas).map(([nome,t])=>[nome,Object.fromEntries(Object.entries(t).map(([tam,v])=>[tam,ativa(c.promocoes.pizzas?.[nome]?.[tam])?n(c.promocoes.pizzas[nome][tam].por):Number(v)]))]))}
function obterPrecosBebidas(){const c=catalogo();return Object.fromEntries(Object.entries(c.bebidas).map(([k,v])=>[k,ativa(c.promocoes.bebidas?.[k])?n(c.promocoes.bebidas[k].por):Number(v)]))}
function atualizarPrecoPizza(nome,tamanho,preco){const d=ler(pizzasPath,{});if(!d[nome]||!(tamanho in d[nome]))throw Error("Pizza ou tamanho não encontrado.");if(!valido(preco))throw Error("Informe um preço entre R$ 0,01 e R$ 5.000,00.");d[nome][tamanho]=n(preco);salvar(pizzasPath,d);return d[nome][tamanho]}
function atualizarIngredientesPizza(nome,ingredientes){const pizzas=ler(pizzasPath,{}),texto=String(ingredientes||"").trim();if(!pizzas[nome])throw Error("Pizza não encontrada.");if(!texto||texto.length>500)throw Error("Informe os ingredientes (até 500 caracteres).");const d=ler(ingredientesPath,{});d[nome]=texto;salvar(ingredientesPath,d);return texto}
function atualizarPrecoBebida(chave,preco){const d=ler(bebidasPath,{});if(!(chave in d))throw Error("Bebida não encontrada.");if(!valido(preco))throw Error("Informe um preço entre R$ 0,01 e R$ 5.000,00.");d[chave]=n(preco);salvar(bebidasPath,d);return d[chave]}
function atualizarPrecoCombo(chave,preco){const d=ler(combosPath,{});if(!(chave in d))throw Error("Combo não encontrado.");if(!valido(preco))throw Error("Informe um preço entre R$ 0,01 e R$ 5.000,00.");d[chave]=n(preco);salvar(combosPath,d);return d[chave]}
function salvarPromocao({tipo,chave,tamanho,nome,de,por,ativa=true}){const c=catalogo(), titulo=String(nome||"").trim();if(!["pizza","bebida"].includes(tipo))throw Error("Tipo inválido.");if(!titulo||titulo.length>80)throw Error("Informe o nome da promoção (até 80 caracteres).");if(!valido(de)||!valido(por)||Number(por)>=Number(de))throw Error("O valor 'por' deve ser menor que o valor 'de'.");if(tipo==="pizza"){if(!c.pizzas[chave]||!(tamanho in c.pizzas[chave]))throw Error("Pizza ou tamanho não encontrado.");c.pizzas[chave][tamanho]=n(de);salvar(pizzasPath,c.pizzas);c.promocoes.pizzas[chave]||={};c.promocoes.pizzas[chave][tamanho]={nome:titulo,de:n(de),por:n(por),ativa:Boolean(ativa)}}else{if(!(chave in c.bebidas))throw Error("Bebida não encontrada.");c.bebidas[chave]=n(de);salvar(bebidasPath,c.bebidas);c.promocoes.bebidas[chave]={nome:titulo,de:n(de),por:n(por),ativa:Boolean(ativa)}}salvar(promosPath,c.promocoes);return c.promocoes}
function removerPromocao(tipo,chave,tamanho){const p=catalogo().promocoes;if(tipo==="pizza"){delete p.pizzas?.[chave]?.[tamanho];if(p.pizzas?.[chave]&&!Object.keys(p.pizzas[chave]).length)delete p.pizzas[chave]}else if(tipo==="bebida")delete p.bebidas?.[chave];else throw Error("Tipo inválido.");salvar(promosPath,p);return p}
module.exports={catalogo,ativa,obterPrecosPizzas,obterPrecosBebidas,atualizarPrecoPizza,atualizarIngredientesPizza,atualizarPrecoBebida,atualizarPrecoCombo,salvarPromocao,removerPromocao};
