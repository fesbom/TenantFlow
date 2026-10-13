ALTER TABLE communication_logs
  ADD COLUMN IF NOT EXISTS appointment_id varchar REFERENCES appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS communication_logs_appointment_idx ON communication_logs (appointment_id);

ALTER TABLE communication_logs
  DROP CONSTRAINT IF EXISTS communication_logs_category_check,
  ADD CONSTRAINT communication_logs_category_check
    CHECK (category IN ('birthday', 'inactivity_6m', 'treatment_completed', 'appointment_confirmation', 'manual')),
  DROP CONSTRAINT IF EXISTS communication_logs_origin_check,
  ADD CONSTRAINT communication_logs_origin_check
    CHECK (origin IN ('automatic', 'manual'));

UPDATE communication_logs AS log
SET
  category = reason.trigger_type,
  origin = CASE
    WHEN reason.is_system_default THEN 'automatic'
    ELSE 'manual'
  END
FROM communication_reasons AS reason
WHERE log.reason_id = reason.id
  AND log.category = 'manual';
