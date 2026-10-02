ALTER TABLE receivable_reminder_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';
ALTER TABLE receivable_reminder_logs
  ADD COLUMN IF NOT EXISTS provider_message_id text;