(() => {
  const normalizar=x=>String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  function iniciar({obterArea,alterado}) {
    const campo=document.getElementById("bairro"),caixa=document.getElementById("sugestoesBairro");
    const memoria=new Map();let versao=0,timer,controlador;
    const parametros=()=>{const a=obterArea();return new URLSearchParams({cidade:a.cidade || "",estado:a.estado || ""}).toString();};
    async function carregar() {
      const id=parametros();if(memoria.has(id))return memoria.get(id);
      const promise=fetch("/api/bairros/catalogo?"+id,{cache:"no-store"}).then(r=>r.ok?r.json():[]).catch(()=>{memoria.delete(id);return [];});
      memoria.set(id,promise);return promise;
    }
    function fechar(){caixa.replaceChildren();caixa.classList.add("hidden");}
    function renderizar(itens) {
      caixa.replaceChildren();
      itens.forEach(item=>{
        const botao=document.createElement("button");botao.type="button";botao.setAttribute("role","option");
        const nome=document.createElement("strong");nome.textContent=item.bairro;botao.append(nome);
        botao.addEventListener("click",()=>{versao++;clearTimeout(timer);controlador?.abort();campo.value=item.bairro;alterado();fechar();});
        caixa.append(botao);
      });caixa.classList.toggle("hidden",!itens.length);
    }
    async function buscar() {
      const atual=++versao,q=campo.value.trim();clearTimeout(timer);controlador?.abort();
      if(q.length<2)return fechar();
      const area=parametros();let externoMostrado=false;
      if(q.length>=3)timer=setTimeout(async()=>{
        if(atual!==versao)return;
        controlador=new AbortController();
        try {const r=await fetch("/api/bairros/sugestoes?q="+encodeURIComponent(q)+"&"+area,{signal:controlador.signal,cache:"no-store"});
          if(!r.ok)return;const itens=await r.json();
          if(atual===versao && itens.length){externoMostrado=true;renderizar(itens);}
        }catch{/* Preserva as opções locais. */}
      },250);
      const locais=await carregar();
      if(atual===versao && !externoMostrado)renderizar(locais.filter(item=>normalizar(q).split(/\s+/).every(t=>normalizar(item.bairro).includes(t))).slice(0,12));
    }
    campo.addEventListener("input",()=>{alterado();buscar();});
    campo.addEventListener("focus",()=>{carregar();if(campo.value.trim().length>=2)buscar();});
    document.addEventListener("focusin",e=>{if(!e.target.closest("#bairro, #sugestoesBairro")){versao++;clearTimeout(timer);controlador?.abort();fechar();}});
    document.addEventListener("click",e=>{if(!e.target.closest("#bairro, #sugestoesBairro")){versao++;clearTimeout(timer);controlador?.abort();fechar();}});
    ["cidadeEntrega","estadoEntrega"].forEach(id=>document.getElementById(id).addEventListener("change",()=>{versao++;clearTimeout(timer);controlador?.abort();memoria.clear();fechar();}));
    return {precarregar:carregar};
  }
  window.MyBotBairros={iniciar};
})();
