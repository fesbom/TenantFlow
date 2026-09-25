CREATE TABLE IF NOT EXISTS "receivables" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "clinic_id" varchar NOT NULL REFERENCES "clinics"("id"),
  "patient_id" varchar NOT NULL REFERENCES "patients"("id"),
  "dentist_id" varchar NOT NULL REFERENCES "users"("id"),
  "treatment_id" varchar REFERENCES "treatments"("id"),
  "descricao" text NOT NULL,
  "valor" decimal(10, 2) NOT NULL,
  "data_vencimento" date NOT NULL,
  "data_pagamento" date,
  "status" text NOT NULL DEFAULT 'Pendente',
  "numero_parcela" integer NOT NULL DEFAULT 1,
  "total_parcelas" integer NOT NULL DEFAULT 1,
  "observacoes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "receivables_status_check" CHECK ("status" IN ('Pendente', 'Pago', 'Vencido', 'Acordo'))
);

CREATE INDEX IF NOT EXISTS "receivables_clinic_idx" ON "receivables" ("clinic_id");
CREATE INDEX IF NOT EXISTS "receivables_dentist_idx" ON "receivables" ("dentist_id");
CREATE INDEX IF NOT EXISTS "receivables_patient_idx" ON "receivables" ("patient_id");
CREATE INDEX IF NOT EXISTS "receivables_vencimento_idx" ON "receivables" ("data_vencimento");
CREATE INDEX IF NOT EXISTS "receivables_treatment_idx" ON "receivables" ("treatment_id");
