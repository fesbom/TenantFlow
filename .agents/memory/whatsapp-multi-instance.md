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
