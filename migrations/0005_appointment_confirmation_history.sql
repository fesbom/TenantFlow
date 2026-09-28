CREATE TABLE IF NOT EXISTS appointment_confirmation_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id varchar NOT NULL REFERENCES clinics(id),
  appointment_id varchar NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id varchar NOT NULL REFERENCES patients(id),
  action text NOT NULL,
  origin text NOT NULL,
  reason text,
  message text,
  provider_message_id text,
  delivery_status text,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE appointment_confirmation_logs
  ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE appointment_confirmation_logs
  ADD COLUMN IF NOT EXISTS delivery_status text;

CREATE INDEX IF NOT EXISTS appointment_confirmation_logs_appointment_idx
  ON appointment_confirmation_logs (appointment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS appointment_confirmation_logs_patient_idx
  ON appointment_confirmation_logs (clinic_id, patient_id, created_at DESC);
