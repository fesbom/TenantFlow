-- Conversas passam a ser únicas por (clinic_id, phone, instance_name),
-- para que o mesmo paciente tenha uma conversa separada por número/dentista.
UPDATE whatsapp_conversations SET instance_name = '' WHERE instance_name IS NULL;
ALTER TABLE whatsapp_conversations ALTER COLUMN instance_name SET DEFAULT '';
ALTER TABLE whatsapp_conversations ALTER COLUMN instance_name SET NOT NULL;
ALTER TABLE whatsapp_conversations DROP CONSTRAINT IF EXISTS uq_wpp_conv_clinic_phone;
ALTER TABLE whatsapp_conversations ADD CONSTRAINT uq_wpp_conv_clinic_phone_instance UNIQUE (clinic_id, phone, instance_name);
