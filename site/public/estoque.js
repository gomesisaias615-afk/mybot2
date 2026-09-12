const parametros = new URLSearchParams(location.search);
const credenciais = { exp: parametros.get("exp"), at: parametros.get("at"), token: parametros.get("token") };
const auth = () => new URLSearchParams(credenciais).toString();
let produtos = [], filtro = "todos", pendente = null;
const $ = id => document.getElementById(id);

function escapar(valor){const d=document.createElement("div");d.textContent=valor;return d.innerHTML}
function atualizarResumo(){ $("total").textContent=produtos.length; $("disponiveis").textContent=produtos.filter(p=>p.quantidade>0).length; $("esgotados").textContent=produtos.filter(p=>p.quantidade<=0).length }
function renderizar(){
  const busca=$("busca").value.toLowerCase();
  const visiveis=produtos.filter(p=>(filtro==="todos"||p.tipo===filtro||(filtro==="esgotados"&&p.quantidade<=0))&&p.nome.toLowerCase().includes(busca));
  $("lista").innerHTML=visiveis.map(p=>`<article class="produto" data-id="${p.tipo}:${p.chave}"><div class="topo"><div><div class="nome">${escapar(p.nome)}</div><div class="tipo">${p.tipo==="pizzas"?"Pizza":"Bebida"}</div></div><span class="quantidade ${p.quantidade<=0?"zero":""}">${p.quantidade}</span></div><div class="acoes"><button data-delta="-1">−1</button><button class="mais" data-delta="1">+1</button><button class="mais" data-delta="5">+5</button><button class="zerar">Zerar</button><input type="number" min="0" max="10000" placeholder="Definir"></div></article>`).join("")||"<p>Nenhum produto encontrado.</p>";
  atualizarResumo();
}
async function api(caminho, opcoes={}){const separador=caminho.includes("?")?"&":"?";const r=await fetch(`${caminho}${separador}${auth()}`,{...opcoes,headers:{"Content-Type":"application/json",...(opcoes.headers||{})}});if(r.status===401||r.status===410){document.body.innerHTML="<main><h1>Link expirado</h1><p>Digite <b>estoque</b> novamente no WhatsApp para receber um novo acesso.</p></main>";throw new Error("Link expirado")};const dados=await r.json();if(!r.ok)throw new Error(dados.erro||"Falha na operação");return dados}
async function carregar(){const dados=await api("/admin/api/estoque");produtos=dados.produtos;renderizar()}
async function alterar(produto, quantidade){$("status").textContent="Salvando alteração...";try{const dados=await api("/admin/api/estoque",{method:"PATCH",body:JSON.stringify({tipo:produto.tipo,chave:produto.chave,quantidade})});produto.quantidade=dados.quantidade;renderizar();$("status").textContent="✓ Estoque atualizado"}catch(e){$("status").textContent=e.message}}
$("lista").addEventListener("click",e=>{const card=e.target.closest(".produto");if(!card||!e.target.matches("button"))return;const [tipo,chave]=card.dataset.id.split(":");const p=produtos.find(x=>x.tipo===tipo&&x.chave===chave);if(e.target.classList.contains("zerar")){pendente=p;$("confirmacaoTexto").textContent=`O estoque de ${p.nome} ficará em zero.`;$("confirmacao").showModal()}else alterar(p,Math.max(0,p.quantidade+Number(e.target.dataset.delta)))});
$("lista").addEventListener("change",e=>{if(e.target.type!=="number")return;const [tipo,chave]=e.target.closest(".produto").dataset.id.split(":");const p=produtos.find(x=>x.tipo===tipo&&x.chave===chave);alterar(p,Math.max(0,Number(e.target.value)||0))});
$("busca").addEventListener("input",renderizar);document.querySelector("nav").addEventListener("click",e=>{if(!e.target.dataset.filtro)return;document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("ativo",b===e.target));filtro=e.target.dataset.filtro;renderizar()});
$("cancelar").onclick=()=>$("confirmacao").close();$("confirmar").onclick=()=>{if(pendente)alterar(pendente,0);pendente=null;$("confirmacao").close()};
setInterval(()=>{const restante=Math.max(0,Number(credenciais.exp)-Date.now());const m=Math.floor(restante/60000),s=Math.floor(restante%60000/1000);$("tempo").textContent=`${m}:${String(s).padStart(2,"0")}`},1000);carregar().catch(()=>{});


