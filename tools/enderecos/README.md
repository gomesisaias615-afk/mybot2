# Gerador de endereços locais

Este gerador transforma o recorte local do OpenStreetMap em uma lista compacta de ruas de Estância/SE. Ele não é consultado pelo cliente: o site usa apenas o JSON final.

Ele também guarda uma cópia temporária no PostgreSQL/PostGIS local, no contêiner Docker `mybot-postgis`.

Para gerar ou atualizar a lista:

```powershell
node tools/enderecos/gerar-estancia.mjs
```

O resultado é salvo em `site/data/enderecos-estancia.json`. O MyBot consulta esse arquivo primeiro nas sugestões de Estância, sem depender do Nominatim público.

O diretório `dados/` contém apenas arquivos grandes e temporários (PBF e GeoJSON). Ele fica fora do Git e não será enviado para o Render. O JSON final contém rua, bairro, cidade, UF, CEP geral e uma coordenada aproximada por rua. Quando o OpenStreetMap registra o bairro somente como um ponto, o gerador atribui o ponto de bairro mais próximo (até 4 km); por isso o bairro serve como sugestão e o cliente ainda deve poder corrigi-lo.

Os dados vêm do OpenStreetMap. Mantenha a atribuição ao OpenStreetMap nas telas que exibirem mapa ou dados derivados.
