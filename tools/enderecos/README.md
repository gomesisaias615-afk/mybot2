# Gerador de endereços locais

## Complemento oficial do IBGE

A lista do site agora combina o recorte anterior do OpenStreetMap com o cadastro municipal completo do CNEFE, Censo 2022, código IBGE 2802106. Download oficial: https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/28_SE/

Extraia o CSV de Estância em `dados/cnefe/` e execute `node tools/enderecos/complementar-ibge.mjs`. Depois de regenerar o recorte OSM com o script abaixo, execute o complemento novamente. O complemento pode ser repetido sem duplicar seus registros.

O importador agrupa por logradouro e localidade, usa um ponto observado próximo da mediana e o CEP mais frequente do grupo. `DSC_LOCALIDADE` é uma localidade do cadastro censitário; não deve ser interpretada como limite oficial de bairro. O ponto representa aproximadamente a rua, não o número da residência. Os dados são de 2022 e não garantem cobertura de alterações posteriores.

Somente os dados agregados de rua/localidade são exportados. Números de casas e nomes de estabelecimentos do arquivo bruto não são publicados. Os arquivos de origem continuam em `dados/`, ignorados pelo Git.

Este gerador transforma o recorte local do OpenStreetMap em uma lista compacta de ruas de Estância/SE. Ele não é consultado pelo cliente: o site usa apenas o JSON final.

Ele também guarda uma cópia temporária no PostgreSQL/PostGIS local, no contêiner Docker `mybot-postgis`.

Para gerar ou atualizar a lista:

```powershell
node tools/enderecos/gerar-estancia.mjs
```

O resultado é salvo em `site/data/enderecos-estancia.json`. O MyBot consulta esse arquivo primeiro nas sugestões de Estância, sem depender do Nominatim público.

O diretório `dados/` contém apenas arquivos grandes e temporários (PBF e GeoJSON). Ele fica fora do Git e não será enviado para o Render. O JSON final contém rua, bairro, cidade, UF, CEP geral e uma coordenada aproximada por rua. Quando o OpenStreetMap registra o bairro somente como um ponto, o gerador atribui o ponto de bairro mais próximo (até 4 km); por isso o bairro serve como sugestão e o cliente ainda deve poder corrigi-lo.

Os dados vêm do OpenStreetMap. Mantenha a atribuição ao OpenStreetMap nas telas que exibirem mapa ou dados derivados.
