ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_by_ai boolean NOT NULL DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS needs_secretary_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS patients_clinic_ai_review_idx
  ON patients (clinic_id, needs_secretary_review, created_at DESC);

CREATE INDEX IF NOT EXISTS patients_clinic_normalized_cpf_idx
  ON patients (clinic_id, (REGEXP_REPLACE(COALESCE(cpf, ''), '[^0-9]', '', 'g')))
  WHERE cpf IS NOT NULL;
