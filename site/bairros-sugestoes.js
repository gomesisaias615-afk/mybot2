const normalizar = valor => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const cache = new Map(), pendentes = new Map();
function listaBairros(itens, cidade, uf, busca="") {
  const vistos=new Set(),termos=normalizar(busca).split(/\s+/).filter(Boolean);
  return itens.filter(item=>normalizar(item.cidade)===normalizar(cidade) && String(item.uf || item.estado).toUpperCase()===uf)
    .map(item=>String(item.bairro || "").trim()).filter(nome=>{
      const id=normalizar(nome);if(!id || vistos.has(id) || !termos.every(t=>id.includes(t)))return false;
      vistos.add(id);return true;
    }).sort((a,b)=>a.localeCompare(b,"pt-BR")).map(bairro=>({bairro,cidade,estado:uf}));
}
async function externos(q,cidade,uf,config) {
  if(!process.env.GEOAPIFY_API_KEY || q.length<3)return [];
  const id=[normalizar(q),normalizar(cidade),uf].join("|"),antigo=cache.get(id);
  if(antigo?.ate>Date.now())return antigo.itens;
  if(pendentes.has(id))return pendentes.get(id);
  const tarefa=(async()=>{
    let itens=[];
    try {
      const url=new URL("https://api.geoapify.com/v1/geocode/autocomplete");
      url.search=new URLSearchParams({text:q+", "+cidade+", "+uf+", Brasil",type:"locality",filter:"countrycode:br",
        lang:"pt",format:"json",limit:"10",apiKey:process.env.GEOAPIFY_API_KEY}).toString();
      if(Number.isFinite(config.latitudeMapaInicial)&&Number.isFinite(config.longitudeMapaInicial))
        url.searchParams.set("bias","proximity:"+config.longitudeMapaInicial+","+config.latitudeMapaInicial);
      const resposta=await fetch(url,{signal:AbortSignal.timeout(2500)});
      if(!resposta.ok)throw Error("Consulta indisponível");
      const dados=await resposta.json();
      itens=listaBairros((dados.results || []).filter(x=>x.country_code==="br").map(x=>({
        cidade:x.city || x.town || x.municipality || x.county,
        uf:String(x.state_code || "").toUpperCase().replace(/^BR-/,""),
        bairro:x.suburb || x.neighbourhood || x.quarter || (["suburb","district"].includes(x.result_type)?x.name || x.district:"")
      })),cidade,uf,q);
    }catch{/* Não substitui bairros locais em caso de falha. */}
    if(cache.size>=300)cache.delete(cache.keys().next().value);
    cache.set(id,{itens,ate:Date.now()+(itens.length?600000:30000)});return itens;
  })();
  pendentes.set(id,tarefa);try{return await tarefa;}finally{pendentes.delete(id);}
}
function registrarBairros(app,obterConfig,obterCatalogo) {
  function area(req) {
    const config=obterConfig(),cidade=String(req.query.cidade || config.cidadeAtendida || "").trim(),
      uf=String(req.query.estado || config.estadoAtendido || "").toUpperCase();
    return {config,cidade,uf,valida:normalizar(cidade)===normalizar(config.cidadeAtendida) && uf===config.estadoAtendido && cidade && /^[A-Z]{2}$/.test(uf)};
  }
  app.get("/api/bairros/catalogo",(req,res)=>{
    const a=area(req);res.set("Cache-Control","no-store");
    res.json(a.valida?listaBairros(obterCatalogo(a.cidade,a.uf),a.cidade,a.uf):[]);
  });
  app.get("/api/bairros/sugestoes",async(req,res)=>{
    const a=area(req),q=String(req.query.q || "").trim();res.set("Cache-Control","no-store");
    if(!a.valida || q.length<2 || q.length>160)return res.json([]);
    const locais=listaBairros(obterCatalogo(a.cidade,a.uf),a.cidade,a.uf,q),fora=await externos(q,a.cidade,a.uf,a.config);
    res.json(listaBairros([...locais,...fora],a.cidade,a.uf).slice(0,12));
  });
}
module.exports={registrarBairros,listaBairros};
