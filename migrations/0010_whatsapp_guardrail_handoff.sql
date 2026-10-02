ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS guardrail_alert boolean NOT NULL DEFAULT false;
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS guardrail_reason text;
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS guardrail_motive text;
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS guardrail_blocked_at timestamp;
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS context_data jsonb NOT NULL DEFAULT '{}'::jsonb;