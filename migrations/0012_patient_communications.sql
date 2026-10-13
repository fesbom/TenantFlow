ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex text;

ALTER TABLE treatments ADD COLUMN IF NOT EXISTS avaliado boolean NOT NULL DEFAULT false;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS avaliado_at timestamp;

CREATE TABLE IF NOT EXISTS communication_reasons (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id varchar NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  message_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_system_default boolean NOT NULL DEFAULT false,
  deleted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT communication_reasons_trigger_check CHECK (trigger_type IN ('birthday', 'inactivity_6m', 'treatment_completed', 'manual'))
);
CREATE INDEX IF NOT EXISTS communication_reasons_clinic_idx ON communication_reasons (clinic_id, is_active);

CREATE TABLE IF NOT EXISTS communication_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id varchar NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id varchar NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reason_id varchar REFERENCES communication_reasons(id) ON DELETE SET NULL,
  treatment_id varchar REFERENCES treatments(id) ON DELETE SET NULL,
  recipient_phone text NOT NULL,
  message_sent text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  evolution_message_id text,
  error text,
  sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT communication_logs_status_check CHECK (status IN ('pending', 'sent', 'failed', 'simulated'))
);
CREATE INDEX IF NOT EXISTS communication_logs_clinic_created_idx ON communication_logs (clinic_id, created_at);
CREATE INDEX IF NOT EXISTS communication_logs_patient_reason_idx ON communication_logs (clinic_id, patient_id, reason_id, sent_at);
CREATE INDEX IF NOT EXISTS communication_logs_treatment_idx ON communication_logs (treatment_id);
