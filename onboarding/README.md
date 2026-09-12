# Entrada completa de uma nova pizzaria

Esta pasta define o formato padrão usado quando o proprietário envia todos os dados da pizzaria de uma vez pela conversa com a IA.

## Dois caminhos continuam disponíveis

1. **Cadastro completo pela IA:** o proprietário envia o material pela conversa. A IA organiza as informações no formato de `pizzaria.exemplo.json`, confere os arquivos e aplica o cadastro em lote.
2. **Cadastro manual pelo painel:** o cliente pode continuar adicionando e editando pizzas, bebidas, ingredientes, preços, promoções, estoque e imagens individualmente.

O cadastro em lote não deve remover nem bloquear as funções existentes do painel.

## O que pedir ao proprietário

- Nome da pizzaria.
- Logo em PNG, JPG ou WebP.
- Telefone do atendente, Instagram e endereço.
- Dias e horários de funcionamento.
- Tamanhos vendidos e limite de sabores.
- Pizzas separadas por categoria, com ingredientes e preço de cada tamanho.
- Bebidas com nome, volume e preço.
- Estoque inicial, se informado.
- Promoções, com período de validade, se houver.
- Uma imagem por produto, preferencialmente identificada pelo nome.

O proprietário não precisa preencher JSON. Ele pode mandar texto, fotos do cardápio, planilha, PDF e imagens soltas. A IA deve transformar o material recebido no formato padrão.

## Regras de conferência antes de aplicar

- Nunca inventar preço, ingrediente, telefone, horário ou promoção.
- Informar claramente os campos que não foram enviados.
- Normalizar nomes repetidos sem apagar produtos diferentes.
- Confirmar que cada foto corresponde ao produto correto.
- Manter os limites atuais: P até 1 sabor, M até 2, G até 2 e F até 3.
- Pizza mista usa o maior preço entre os sabores escolhidos no mesmo tamanho.
- Usar valores numéricos, sem o símbolo R$.
- Não substituir dados persistentes de outra pizzaria sem identificar corretamente o destino.
- Fazer uma validação final e resumir quantas pizzas, bebidas, imagens e promoções serão cadastradas.

## Como anexar imagens

Envie a logo e as fotos com nomes fáceis de reconhecer, por exemplo:

- `logo.png`
- `pizza-calabresa.jpg`
- `pizza-portuguesa.webp`
- `coca-cola-2l.jpg`

Se os arquivos vierem com nomes genéricos, a IA deve criar o vínculo entre arquivo e produto na propriedade `arquivoImagem`.

## Campos opcionais

Campos não enviados podem permanecer vazios ou ser omitidos. Isso permite começar com os dados disponíveis e completar depois pelo painel.

