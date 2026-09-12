# WhatsApp Cloud API no BOT1

O BOT1 aceita dois provedores:

- `WHATSAPP_PROVIDER=baileys`: mantém a conexão atual por QR Code.
- `WHATSAPP_PROVIDER=cloud_api`: ativa a API oficial da Meta.

Não altere o provedor para `cloud_api` antes de concluir o cadastro e configurar o webhook.

## 1. Dados necessários na Meta

No painel do aplicativo Meta, obtenha:

- token de acesso;
- ID do número de telefone;
- ID da conta do WhatsApp Business (WABA);
- segredo do aplicativo.

Crie também uma frase secreta própria para verificar o webhook. Ela será o valor de `WHATSAPP_VERIFY_TOKEN` e deve ser igual no Meta e no Render.

## 2. Variáveis no Render

```text
WHATSAPP_PROVIDER=cloud_api
WHATSAPP_ACCESS_TOKEN=token_da_meta
WHATSAPP_PHONE_NUMBER_ID=id_do_numero
WHATSAPP_WABA_ID=id_da_waba
WHATSAPP_VERIFY_TOKEN=uma_frase_secreta_criada_por_voce
WHATSAPP_BUSINESS_NUMBER=55DDDNUMERO
META_APP_SECRET=segredo_do_aplicativo_meta
META_GRAPH_API_VERSION=v23.0
```

Mantenha também as variáveis existentes do MongoDB, Groq, Mercado Pago, URL pública e atendente.

## 3. Webhook na Meta

Use como URL de callback:

```text
https://SEU-SERVICO.onrender.com/webhook/whatsapp
```

No campo de token de verificação, informe exatamente o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.

Depois da verificação, assine pelo menos o campo `messages` da conta do WhatsApp Business.

## 4. Verificação

Abra:

```text
https://SEU-SERVICO.onrender.com/health
```

O resultado esperado é:

```json
{
  "status": "ok",
  "whatsapp": "online",
  "provider": "cloud_api"
}
```

Envie primeiro uma mensagem para o número de teste da Meta. O log do Render deve mostrar `MENSAGEM RECEBIDA` e o bot deve responder sem QR Code.

## Observação sobre mensagens iniciadas pela pizzaria

Respostas dentro da janela de atendimento iniciada pelo cliente podem ser enviadas normalmente. Mensagens iniciadas pela empresa ou enviadas fora da janela permitida precisam usar modelos aprovados pela Meta. O módulo antigo de campanhas não deve ser usado pela Cloud API até ser adaptado para templates.

