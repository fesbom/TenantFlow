ALTER TABLE clinics ADD COLUMN IF NOT EXISTS ai_attendance_enabled boolean NOT NULL DEFAULT true;
