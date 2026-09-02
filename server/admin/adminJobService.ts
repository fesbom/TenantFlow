import fs from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import { pool } from "../db";
import { claimJob, queryRows, updateJob } from "./adminRepository";
import { ObjectStorageService } from "../objectStorage";

const exportRoot = path.join(process.cwd(), "private-admin-exports");
const allowedModules = new Set(["appointments", "records", "messages", "patients"]);

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return `${columns.map(csvCell).join(",")}\n${rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")).join("\n")}\n`;
}

const exportQueries: Record<string, string> = {
  "clinica.csv": `SELECT id, name AS nome, email, phone AS telefone, address AS endereco, invoice_fields AS campos_nota_fiscal, status, created_at AS criado_em FROM clinics WHERE id=$1`,
  "usuario.csv": `SELECT id, full_name AS nome, username AS nome_usuario, email, role AS funcao, clinic_id AS id_clinica, is_active AS ativo, created_at AS criado_em FROM users WHERE clinic_id=$1`,
  "paciente.csv": `SELECT id, full_name AS nome, email, cpf, rg, phone AS telefone, work_phone AS telefone_trabalho, birth_date AS data_nascimento, marital_status AS estado_civil, cep, address AS endereco, number AS numero, complement AS complemento, neighborhood AS bairro, city AS cidade, state AS estado, medical_notes AS observacoes, external_id, created_at AS criado_em FROM patients WHERE clinic_id=$1`,
  "agendamento.csv": `SELECT id, patient_id AS id_paciente, dentist_id AS id_dentista, scheduled_date AS data, duration AS duracao, procedure AS procedimento, status, notes AS observacoes, created_at AS criado_em FROM appointments WHERE clinic_id=$1`,
  "prontuario.csv": `SELECT id, patient_id AS id_paciente, dentist_id AS id_dentista, appointment_id AS id_agendamento, procedure AS procedimento, clinical_notes AS notas_clinicas, treatment_plan AS plano_tratamento, cost AS custo, created_at AS criado_em FROM medical_records WHERE clinic_id=$1`,
  "anamnese_pergunta.csv": `SELECT id, question AS pergunta, type AS tipo, options AS opcoes, is_required AS obrigatoria, created_at AS criado_em FROM anamnesis_questions WHERE clinic_id=$1`,
  "anamnese_resposta.csv": `SELECT ar.id, ar.patient_id AS id_paciente, ar.question_id AS id_pergunta, ar.treatment_id AS id_tratamento, ar.appointment_id AS id_agendamento, ar.response AS resposta, ar.created_at AS criado_em FROM anamnesis_responses ar JOIN patients p ON p.id=ar.patient_id WHERE p.clinic_id=$1`,
  "tratamento.csv": `SELECT id, patient_id AS id_paciente, dentist_id AS id_dentista, data_inicio, situacao_tratamento AS situacao, titulo_tratamento AS titulo, external_id, created_at AS criado_em FROM treatments WHERE clinic_id=$1`,
  "tratamento_orcamento.csv": `SELECT bi.id, bi.treatment_id AS id_tratamento, bi.descricao_orcamento AS descricao, bi.valor_orcamento AS valor, bi.external_id FROM budget_items bi JOIN treatments t ON t.id=bi.treatment_id WHERE t.clinic_id=$1`,
  "tratamento_orcamento_resumo.csv": `SELECT bs.id, bs.treatment_id AS id_tratamento, bs.subtotal_orcamento AS subtotal, bs.desconto_orcamento AS desconto, bs.total_orcamento AS total, bs.condicao_pagamento FROM budget_summary bs JOIN treatments t ON t.id=bs.treatment_id WHERE t.clinic_id=$1`,
  "tratamento_movimentacao.csv": `SELECT tm.id, tm.treatment_id AS id_tratamento, tm.data_movimentacao AS data, tm.descricao_atividade AS descricao, tm.valor_servico AS valor, tm.region AS regiao, tm.tooth_number AS dente, tm.external_id FROM treatment_movements tm JOIN treatments t ON t.id=tm.treatment_id WHERE t.clinic_id=$1`,
  "orcamento.csv": `SELECT id, patient_id AS id_paciente, dentist_id AS id_dentista, title AS titulo, procedures AS procedimentos, total_cost AS valor_total, status, valid_until AS validade, notes AS observacoes FROM budgets WHERE clinic_id=$1`,
  "conversa_whatsapp.csv": `SELECT id, patient_id AS id_paciente, phone AS telefone, status, instance_name AS instancia, assigned_user_id AS id_usuario, last_message_at, created_at FROM whatsapp_conversations WHERE clinic_id=$1`,
  "mensagem_whatsapp.csv": `SELECT m.id, m.conversation_id AS id_conversa, m.sender AS remetente, m.direction AS direcao, m.texto, m.created_at FROM (SELECT id, conversation_id, sender, direction, text AS texto, created_at FROM whatsapp_messages) m JOIN whatsapp_conversations c ON c.id=m.conversation_id WHERE c.clinic_id=$1`,
  "configuracao_agenda.csv": `SELECT id, dentist_id AS id_dentista, weekday AS dia_semana, period AS periodo, start_time AS inicio, end_time AS fim, is_active AS ativo FROM dentist_schedules WHERE clinic_id=$1`,
  "feriado.csv": `SELECT id, date AS data, end_date AS data_fim, name AS nome, type AS tipo, message AS mensagem, created_at FROM clinic_holidays WHERE clinic_id=$1`,
  "instancia_whatsapp.csv": `SELECT id, instance_name AS instancia, connected_phone AS telefone_conectado, label, created_at FROM whatsapp_instances WHERE clinic_id=$1`,
  "instancia_dentista.csv": `SELECT wid.id, wid.instance_id AS id_instancia, wid.dentist_id AS id_dentista FROM whatsapp_instance_dentists wid JOIN whatsapp_instances wi ON wi.id=wid.instance_id WHERE wi.clinic_id=$1`,
};

export async function processAdminJob(jobId: string) {
  const job = await claimJob(jobId);
  if (!job) return;
  try {
    const result = job.type === "clinic_export"
      ? await exportClinic(jobId, job.clinicId!)
      : job.type === "clinic_cleanup"
        ? await cleanupClinic(job.clinicId!, job.payload.modules as string[])
        : await mediaOperation(job.type, job.clinicId!, job.payload);
    await updateJob(jobId, { status: "completed", progress: 100, result, completedAt: new Date() });
  } catch (error: any) {
    await updateJob(jobId, { status: "failed", error: error?.message || "Falha desconhecida", completedAt: new Date() });
  }
}

export async function resumePendingAdminJobs() {
  const rows = await queryRows(
    `UPDATE admin_jobs SET status='queued', progress=0, started_at=NULL
     WHERE status='queued' OR (status='running' AND started_at < now() - interval '30 minutes')
     RETURNING id`,
  );
  for (const row of rows) setImmediate(() => void processAdminJob(row.id));
}

async function exportClinic(jobId: string, clinicId: string) {
  const dir = path.join(exportRoot, jobId);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  let completed = 0;
  const fileCounts: Record<string, number> = {};
  for (const [name, query] of Object.entries(exportQueries)) {
    const rows = await queryRows(query, [clinicId]);
    fileCounts[name] = rows.length;
    await fs.writeFile(path.join(dir, name), toCsv(rows), { encoding: "utf8", mode: 0o600 });
    completed++;
    await updateJob(jobId, { progress: Math.round((completed / (Object.keys(exportQueries).length + 2)) * 90) });
  }
  const media = await collectMedia(clinicId);
  await fs.writeFile(path.join(dir, "media-manifest.json"), JSON.stringify(media, null, 2), { mode: 0o600 });
  const manifest = {
    format: "denticare-clinic-export", version: 1, clinicId, generatedAt: new Date().toISOString(),
    files: fileCounts, security: { passwordsExcluded: true, apiKeysExcluded: true, signedUrlsExcluded: true },
  };
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  const zipPath = path.join(exportRoot, `${jobId}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  await new Promise<void>((resolve, reject) => zip.writeZip(zipPath, (error) => error ? reject(error) : resolve()));
  await fs.chmod(zipPath, 0o600);
  await fs.rm(dir, { recursive: true, force: true });
  return { artifact: `${jobId}.zip`, mimeType: "application/zip", files: fileCounts };
}

async function collectMedia(clinicId: string) {
  const rows = await queryRows(`
    SELECT 'clinic_logo' type, id AS owner_id, logo_url value FROM clinics WHERE id=$1 AND logo_url IS NOT NULL
    UNION ALL SELECT 'patient_photo', id, photo_url FROM patients WHERE clinic_id=$1 AND photo_url IS NOT NULL
    UNION ALL SELECT 'medical_record_images', id, images FROM medical_records WHERE clinic_id=$1 AND images IS NOT NULL
    UNION ALL SELECT 'treatment_movement_photo', tm.id, tm.foto_atividade FROM treatment_movements tm JOIN treatments t ON t.id=tm.treatment_id WHERE t.clinic_id=$1 AND tm.foto_atividade IS NOT NULL
  `, [clinicId]);
  const objectStorage = new ObjectStorageService();
  return rows.flatMap((row) => mediaValues(row.value).map((value) => {
    const objectPath = value.startsWith("http")
      ? objectStorage.extractObjectPathFromUrl(value)
      : null;
    return {
      type: row.type,
      ownerId: row.owner_id,
      objectPath,
      reference: value.startsWith("/uploads/") ? value : null,
      externalReferenceRedacted: value.startsWith("http"),
    };
  }));
}

function mediaValues(value: unknown): string[] {
  if (typeof value !== "string") return [];
  if (!value.trim().startsWith("[")) return [value];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function cleanupClinic(clinicId: string, modules: string[]) {
  if (!Array.isArray(modules) || !modules.length || modules.some((m) => !allowedModules.has(m))) {
    throw new Error("Módulos de limpeza inválidos.");
  }
  const client = await pool.connect();
  const deleted: Record<string, number> = {};
  const allMediaBeforeDelete = (modules.includes("patients") || modules.includes("records"))
    ? await collectMedia(clinicId)
    : [];
  const mediaBeforeDelete = allMediaBeforeDelete.filter((item) => {
    if (!item.objectPath?.startsWith(`${clinicId}/`)) return false;
    if (item.type === "clinic_logo") return false;
    if (modules.includes("patients")) return item.type !== "clinic_logo";
    return modules.includes("records") && item.type === "medical_record_images";
  });
  try {
    await client.query("BEGIN");
    const run = async (name: string, query: string) => {
      const result = await client.query(query, [clinicId]);
      deleted[name] = (deleted[name] || 0) + (result.rowCount || 0);
    };
    if (modules.includes("patients")) {
      await run("whatsapp_patient_links", `UPDATE whatsapp_conversations SET patient_id=NULL WHERE clinic_id=$1 AND patient_id IS NOT NULL`);
      await run("anamnesis_responses", `DELETE FROM anamnesis_responses ar USING patients p WHERE ar.patient_id=p.id AND p.clinic_id=$1`);
      await run("budget_summary", `DELETE FROM budget_summary bs USING treatments t WHERE bs.treatment_id=t.id AND t.clinic_id=$1`);
      await run("budget_items", `DELETE FROM budget_items bi USING treatments t WHERE bi.treatment_id=t.id AND t.clinic_id=$1`);
      await run("treatment_movements", `DELETE FROM treatment_movements tm USING treatments t WHERE tm.treatment_id=t.id AND t.clinic_id=$1`);
      await run("medical_records", `DELETE FROM medical_records WHERE clinic_id=$1`);
      await run("budgets", `DELETE FROM budgets WHERE clinic_id=$1`);
      await run("appointments", `DELETE FROM appointments WHERE clinic_id=$1`);
      await run("treatments", `DELETE FROM treatments WHERE clinic_id=$1`);
      await run("patients", `DELETE FROM patients WHERE clinic_id=$1`);
    } else {
      if (modules.includes("appointments")) {
        await run("record_appointment_links", `UPDATE medical_records SET appointment_id=NULL WHERE clinic_id=$1 AND appointment_id IS NOT NULL`);
        await run("response_appointment_links", `UPDATE anamnesis_responses ar SET appointment_id=NULL FROM patients p WHERE ar.patient_id=p.id AND p.clinic_id=$1 AND ar.appointment_id IS NOT NULL`);
        await run("appointments", `DELETE FROM appointments WHERE clinic_id=$1`);
      }
      if (modules.includes("records")) {
        await run("medical_records", `DELETE FROM medical_records WHERE clinic_id=$1`);
      }
    }
    if (modules.includes("messages")) {
      await run("whatsapp_messages", `DELETE FROM whatsapp_messages m USING whatsapp_conversations c WHERE m.conversation_id=c.id AND c.clinic_id=$1`);
      await run("whatsapp_conversations", `DELETE FROM whatsapp_conversations WHERE clinic_id=$1`);
    }
    await client.query("COMMIT");
    let mediaDeletion: Record<string, unknown> = { supported: true, deleted: 0, failed: 0 };
    if (process.env.NODE_ENV === "production") {
      const objectStorage = new ObjectStorageService();
      let removed = 0;
      let failed = 0;
      for (const item of mediaBeforeDelete) {
        if (!item.objectPath) continue;
        try {
          if (await objectStorage.deleteObjectPath(item.objectPath)) removed++;
        } catch {
          failed++;
        }
      }
      mediaDeletion = { supported: true, scope: "gcs_transactional_media", deleted: removed, failed };
    } else if (modules.includes("patients") && /^[a-zA-Z0-9_-]+$/.test(clinicId)) {
      try {
        await fs.rm(path.join(process.cwd(), "uploads", clinicId, "patients"), { recursive: true, force: true });
        mediaDeletion = { supported: true, scope: "local_patient_media", deleted: true };
      } catch (error: any) {
        mediaDeletion = { supported: true, scope: "local_patient_media", deleted: false, error: error?.message };
      }
    }
    return { deleted, preserved: ["clinics", "users"], mediaDeletion };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function mediaOperation(type: string, clinicId: string, payload: Record<string, unknown>) {
  if (type === "orphan_media_cleanup" && payload.confirm !== true) throw new Error("Confirmação obrigatória.");
  const localDir = path.join(process.cwd(), "uploads", clinicId);
  if (process.env.NODE_ENV === "production") {
    const objectStorage = new ObjectStorageService();
    const allObjects = await objectStorage.listObjectPaths(`${clinicId}/`);
    const media = await collectMedia(clinicId);
    const referenced = new Set(media.map((item) => item.objectPath).filter(Boolean));
    const orphans = allObjects.filter((objectPath) => !referenced.has(objectPath));
    if (type === "orphan_media_scan") {
      return { supported: true, dryRun: true, objectCount: allObjects.length, orphanCount: orphans.length, objects: orphans };
    }
    const reviewedObjects = Array.isArray(payload.objects)
      ? payload.objects.filter((value): value is string => typeof value === "string" && value.startsWith(`${clinicId}/`))
      : [];
    if (!reviewedObjects.length) {
      return { supported: true, dryRun: false, orphanCount: 0, deleted: 0, failed: 0 };
    }
    // Exclui somente o conjunto imutável revisado e apenas se ainda estiver órfão agora.
    const currentOrphans = new Set(orphans);
    const approvedOrphans = reviewedObjects.filter((objectPath) => currentOrphans.has(objectPath));
    let deleted = 0;
    const failures: string[] = [];
    for (const objectPath of approvedOrphans) {
      try {
        if (await objectStorage.deleteObjectPath(objectPath)) deleted++;
      } catch {
        failures.push(objectPath);
      }
    }
    return { supported: true, dryRun: false, reviewedCount: reviewedObjects.length, orphanCount: approvedOrphans.length, deleted, failed: failures.length, failures };
  }
  try {
    await fs.access(localDir);
  } catch {
    return { supported: true, dryRun: type === "orphan_media_scan", orphanCount: 0, objects: [] };
  }
  // Local files can be listed, but URL references may be embedded in JSON; avoid unsafe deletion.
  return { supported: false, reason: "Varredura local detecta arquivos, mas não pode provar orfandade de referências JSON com segurança." };
}

export function getExportPath(jobId: string) {
  return path.join(exportRoot, `${jobId}.zip`);
}