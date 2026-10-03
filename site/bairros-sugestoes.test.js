const test=require("node:test"),assert=require("node:assert/strict"),fs=require("fs"),path=require("path"),vm=require("vm");
const {listaBairros}=require("./bairros-sugestoes");
test("bairros separados de ruas, sem duplicação e restritos ao município",()=>{
 const itens=[{rua:"Rua A",bairro:"Centro",cidade:"Estância",uf:"SE"},{rua:"Rua B",bairro:"CENTRO",cidade:"Estância",uf:"SE"},
 {rua:"Rua C",bairro:"Outro",cidade:"Aracaju",uf:"SE"},{bairro:"São Jorge",cidade:"Estância",uf:"SE"}];
 const bairros=listaBairros(itens,"Estância","SE","sao");assert.equal(bairros.length,1);assert.equal(bairros[0].bairro,"São Jorge");
 assert.equal(listaBairros(itens,"Estância","SE").length,2);assert.equal("rua" in bairros[0],false);
});
test("bairro selecionado altera apenas bairro e some ao sair; busca externa espera 250 ms",async()=>{
 function no(){return {value:"",children:[],eventos:{},classList:{add(){},toggle(){}},replaceChildren(){this.children=[];},
  append(x){this.children.push(x);},addEventListener(e,fn){this.eventos[e]=fn;},setAttribute(){}};}
 const campos={bairro:no(),sugestoesBairro:no(),cidadeEntrega:no(),estadoEntrega:no(),rua:no(),cep:no()};
 campos.bairro.value="cen";campos.rua.value="Rua já digitada";campos.cep.value="49200000";
 const eventos={},timers=[];let alteracoes=0;
 const contexto={window:{},Map,AbortController,URLSearchParams,encodeURIComponent,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},
  document:{getElementById:id=>campos[id],createElement:no,addEventListener:(e,fn)=>eventos[e]=fn},
  fetch:async()=>({ok:true,json:async()=>[{bairro:"Centro",cidade:"Estância",estado:"SE"}]})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"public/bairros-busca.js"),"utf8"),contexto);
 contexto.window.MyBotBairros.iniciar({obterArea:()=>({cidade:"Estância",estado:"SE"}),alterado:()=>alteracoes++});
 async function flush(){for(let i=0;i<15;i++)await Promise.resolve();}
 campos.bairro.eventos.input();await flush();assert.equal(timers[0].ms,250);
 assert.equal(campos.sugestoesBairro.children.length,1);
 campos.sugestoesBairro.children[0].eventos.click();assert.equal(campos.bairro.value,"Centro");
 assert.equal(campos.rua.value,"Rua já digitada");assert.equal(campos.cep.value,"49200000");
 assert.equal(campos.sugestoesBairro.children.length,0);assert.equal(alteracoes,2);
 campos.bairro.value="cen";campos.bairro.eventos.input();await flush();
 eventos.click({target:{closest:()=>null}});await timers.at(-1).fn();await flush();
 assert.equal(campos.sugestoesBairro.children.length,0);
});
