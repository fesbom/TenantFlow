ALTER TABLE clinics ADD COLUMN IF NOT EXISTS auto_communications_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE communication_reasons ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS communication_logs_category_patient_idx ON communication_logs (clinic_id, patient_id, category, created_at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_access jsonb NOT NULL DEFAULT '{}'::jsonb;
