CREATE TABLE IF NOT EXISTS receivable_reminder_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id varchar NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  receivable_id varchar NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  patient_id varchar NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  phone text NOT NULL,
  message text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receivable_reminder_logs_receivable_idx
  ON receivable_reminder_logs (receivable_id, created_at DESC);
CREATE INDEX IF NOT EXISTS receivable_reminder_logs_clinic_idx
  ON receivable_reminder_logs (clinic_id, created_at DESC);