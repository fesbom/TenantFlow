ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "confirmation_sent_at" timestamp;