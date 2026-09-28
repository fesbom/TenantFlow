ALTER TABLE receivables DROP CONSTRAINT IF EXISTS receivables_status_check;
ALTER TABLE receivables
  ADD CONSTRAINT receivables_status_check
  CHECK (status IN ('Pendente', 'Pago', 'Vencido', 'Acordo', 'Cancelado'));