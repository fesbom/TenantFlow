ALTER TABLE clinics ADD COLUMN IF NOT EXISTS ai_print_summary_enabled boolean NOT NULL DEFAULT true;
