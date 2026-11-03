# WhatsApp oficial (Cloud API) · número de atendimento (47) 99610-9545

## Como está montado

- O cérebro é o mesmo do chat do site (função `atendimento`). O WhatsApp entra pelo endereço
  `https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento?canal=whatsapp`.
- Toda mensagem recebida tem a assinatura da Meta conferida (`X-Hub-Signature-256`). Sem a assinatura certa, nada é processado.
- O robô responde texto, áudio (transcrito), foto e lista tocável de horários de visita.
- Quando passa para o Anderson, o robô pausa naquela conversa. O Anderson responde pelo admin (aba WhatsApp) dentro da janela de 24h.
- Tudo nasce desligado: robô em modo teste (só responde aos números de teste) e follow-up desligado em modo ensaio.

## Segredos (Supabase > Edge Functions > Secrets)

O Anderson cola estes valores direto no painel do Supabase. Nunca no chat.

| Nome | De onde vem |
|---|---|
| `WHATSAPP_TOKEN` | Token permanente do usuário do sistema (Configurações do negócio > Usuários do sistema) com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` |
| `WHATSAPP_PHONE_ID` | WhatsApp > Configuração da API > "Identificação do número de telefone" do 99610-9545 |
| `WHATSAPP_APP_SECRET` | Configurações do app > Básico > Chave secreta do app |
| `WHATSAPP_VERIFY_TOKEN` | Uma frase qualquer inventada por você (ex.: 30 letras e números). A mesma vai no campo "Verificar token" do webhook |

## Webhook (no app da Meta)

1. WhatsApp > Configuração > Webhook > Editar.
2. URL de retorno: `https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento?canal=whatsapp`
3. Verificar token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.
4. Assinar o campo `messages`.

## Modelos de mensagem para aprovar (Gerenciador do WhatsApp > Modelos)

Categoria: Marketing. Idioma: Português (BR). Variável {{1}} = primeiro nome.
Em cada um, adicionar botão de resposta rápida "Parar mensagens" (o sistema bloqueia o número na hora).

1. `retomada_atendimento`
   > Oi, {{1}}! Aqui é a assistente virtual do Anderson Costa. Ficou alguma dúvida sobre a sua busca de imóvel? Se quiser, separo uns horários para você conhecer pessoalmente.
   Botões: "Quero continuar", "Parar mensagens"

2. `opcoes_curadoria`
   > Oi, {{1}}! Separei algumas opções que combinam com o que você me contou. Quer que eu te mande por aqui?
   Botões: "Pode mandar", "Parar mensagens"

3. `retomada_visita`
   > Oi, {{1}}! Se fizer sentido ver algum imóvel de perto, o Anderson tem horários nesta semana. Prefere manhã, tarde ou sábado?
   Botões: "Manhã", "Tarde", "Parar mensagens"

4. `encerramento_contato`
   > Oi, {{1}}. Não quero ser insistente, então vou pausar por aqui. Se a busca voltar a fazer sentido, é só responder esta mensagem. Anderson Costa, CRECI SC 68594.
   Botões: "Ainda tenho interesse"

5. `lembrete_visita` (categoria Utilidade, para uso futuro)
   > Oi, {{1}}! Lembrete da sua visita com o Anderson Costa em {{2}}. Se precisar remarcar, é só responder por aqui.

Exemplo para a Meta (campo de amostra da variável): Mariana.

## Custos (out/2026)

- Responder quem escreveu primeiro, dentro de 24h: grátis.
- Fora das 24h só vai modelo aprovado. Marketing cerca de R$ 0,32 por mensagem entregue; utilidade cerca de R$ 0,035.
- Um lead que recebe os 4 toques custa no máximo uns R$ 1,30.

## Travas do follow-up

Ver aba WhatsApp > Travas no admin. Resumo:
- Só entra quem conversou com o robô depois de o follow-up ser ligado.
- Cada envio reconfere: etapa, não contatar, lista de bloqueio, visita marcada, conversa com o Anderson, resposta da pessoa, limites.
- Resposta da pessoa ou mensagem do Anderson cancela a fila daquele lead na hora (gatilho no banco).
- Pedido para parar bloqueia o número para sempre (tabela `supressao`).
- Disjuntor desliga tudo e manda e-mail se passar do limite de pedidos para parar no dia ou se muitos envios falharem.

# Estúdio (Instagram, Facebook e anúncios) · mesmo app da Meta

## Segredos a mais (Supabase > Edge Functions > Secrets)

| Nome | De onde vem |
|---|---|
| `META_SOCIAL_TOKEN` | O mesmo usuário do sistema da BM, com token permanente que tenha as permissões abaixo. Pode ser o mesmo valor do `WHATSAPP_TOKEN` se você gerar um token só com todas as permissões |
| `META_AD_ACCOUNT_ID` | Número da conta de anúncios (Gerenciador de Anúncios, só os dígitos, sem "act_") |

Permissões do token: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `ads_management`, `ads_read`, `business_management`, `whatsapp_business_messaging`, `whatsapp_business_management`.

No usuário do sistema, atribua os ativos: a Página do Facebook, a conta do Instagram, a conta de anúncios e a conta do WhatsApp.

## Webhook dos comentários (comentário que vira mensagem)

No app da Meta, Webhooks, objeto **Instagram**: URL `https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/meta`, o mesmo "Verificar token" do WhatsApp, e assine o campo `comments`.

## Regras

- Nada é publicado sem a aprovação do Anderson (botão "Aprovar e agendar" ou "Publicar agora").
- Anúncios são criados sempre pausados; só gastam depois de "Ativar".
- Vídeos publicados são apagados do armazenamento depois de publicados (o plano grátis tem 1 GB).
