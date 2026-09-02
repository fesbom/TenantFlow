ALTER TABLE clinics ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS suspended_at timestamp;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS suspended_by varchar;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE users ALTER COLUMN clinic_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE clinics ADD CONSTRAINT clinics_status_check CHECK (status IN ('active', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS access_audit_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  clinic_id varchar REFERENCES clinics(id) ON DELETE SET NULL,
  attempted_email text,
  ip_address text,
  user_agent text,
  reason text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_audit_created_idx ON access_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS access_audit_clinic_idx ON access_audit_logs(clinic_id);
CREATE INDEX IF NOT EXISTS access_audit_user_idx ON access_audit_logs(user_id);

CREATE TABLE IF NOT EXISTS ai_usage_records (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id varchar NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  source text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_clinic_created_idx ON ai_usage_records(clinic_id, created_at);

CREATE TABLE IF NOT EXISTS admin_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  clinic_id varchar REFERENCES clinics(id) ON DELETE SET NULL,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  CONSTRAINT admin_jobs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  CONSTRAINT admin_jobs_progress_check CHECK (progress BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS admin_jobs_actor_idx ON admin_jobs(actor_user_id);
CREATE INDEX IF NOT EXISTS admin_jobs_clinic_idx ON admin_jobs(clinic_id);
CREATE INDEX IF NOT EXISTS admin_jobs_status_idx ON admin_jobs(status);