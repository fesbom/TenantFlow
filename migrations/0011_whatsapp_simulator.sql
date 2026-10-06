ALTER TABLE clinics ADD COLUMN IF NOT EXISTS simulation_mode boolean NOT NULL DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS simulation_updated_at timestamp;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS simulation_updated_by varchar;

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS whatsapp_messages_simulated_idx ON whatsapp_messages (conversation_id, is_simulated);

CREATE TABLE IF NOT EXISTS simulation_contacts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id varchar NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id varchar REFERENCES patients(id) ON DELETE SET NULL,
  name text,
  phone text NOT NULL,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_simulation_contacts_clinic_phone UNIQUE (clinic_id, phone)
);
