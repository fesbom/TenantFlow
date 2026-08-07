---
name: WhatsApp Multi-Instance
description: Arquitetura de múltiplos números de WhatsApp por clínica com contexto de IA por instância
---

## Regra principal
Cada clínica pode ter N instâncias em `whatsapp_instances`. O webhook resolve a instância pelo nome (`data.instance`), busca dentistas vinculados e constrói `InstanceContext` antes de chamar a IA.

**Why:** Sistema multi-tenancy onde dentistas precisam de números exclusivos de WhatsApp (ex.: agenda do Dr. João) sem misturar com o atendimento geral.

**How to apply:**
- Tabelas: `whatsapp_instances` (label, instanceName, apiKey, connectedPhone, clinicId), `whatsapp_instance_dentists` (instanceId, dentistId).
- Webhook: busca primeiro em `whatsapp_instances`, fallback para `clinics.evolutionInstanceName` (legado).
- `InstanceContext` = `exclusive` (1 dentista) | `shared` (N dentistas) | `general` (sem vínculo).
- `processPatientMessage` aceita `instanceContext` como 5º arg opcional.
- CRUD via `/api/whatsapp/instances` (GET/POST/PATCH/DELETE) + `/api/whatsapp/instances/:id/connect` + `/api/whatsapp/instances/:id/status`.
- Settings UI: card "WhatsApp — Números" com tabela de instâncias, dialog de add/edit com multi-select de dentistas e QR code por instância.
- Support UI: pílula de status mostra contagem de números conectados ou o número do único conectado.

## Webhook dev vs prod
- Evolution webhooks são persistentes por instância: em dev, `getWebhookUrl()` (server/evolutionService.ts) aponta para `REPLIT_DEV_DOMAIN`; em produção usa `WEBHOOK_GLOBAL_URL`. Ao trocar de ambiente, é preciso reconectar/reaplicar o webhook (`/webhook/set/:instance`) — senão as mensagens vão para o ambiente errado.
- **Why:** mensagens "não chegavam" porque o webhook apontava para o app publicado enquanto se testava em dev.
- Frontend é servido como build estático de `dist/public`; workflow roda `npm run build && npm run dev` — sem build, mudanças de frontend não aparecem.
- Conversas têm unique `(clinic_id, phone)` (`uq_wpp_conv_clinic_phone`) + catch 23505 no webhook para evitar conversas duplicadas em entregas simultâneas.
- Webhook `/webhook/evolution` é público e sem autenticação (risco conhecido, ainda não tratado).
