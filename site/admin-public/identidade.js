(()=>{fetch("/api/identidade",{cache:"no-store"}).then(r=>r.json()).then(i=>{document.title="MyBot | Painel da "+i.nome;document.querySelectorAll("[data-logo-pizzaria]").forEach(x=>x.src=i.logo);document.querySelectorAll("[data-nome-pizzaria]").forEach(x=>x.textContent=i.nome)}).catch(()=>{})})();

