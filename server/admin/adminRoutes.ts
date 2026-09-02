import type { Express, Request } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs/promises";
import { pool } from "../db";
import { authenticateToken, requireRole, type AuthenticatedRequest } from "../middleware/auth";
import {
  createJob, getClinicDetail, getJob, listAudits, listClinics, queryRows,
  setClinicStatus, setUserActive,
} from "./adminRepository";
import { getExportPath, processAdminJob, resumePendingAdminJobs } from "./adminJobService";

const superadminOnly = [authenticateToken, requireRole(["superadmin"])] as const;
const pageParams = (req: Request) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize) || 20)),
});

export function registerAdminRoutes(app: Express) {
  app.post("/api/admin/bootstrap", async (req, res) => {
    const configured = process.env.ADMIN_SETUP_TOKEN;
    const supplied = req.header("x-admin-setup-token");
    if (!configured) return res.status(503).json({ code: "BOOTSTRAP_NAO_CONFIGURADO", message: "ADMIN_SETUP_TOKEN não configurado." });
    if (!supplied || !safeEqual(supplied, configured)) {
      return res.status(403).json({ code: "TOKEN_SETUP_INVALIDO", message: "Token de configuração inválido." });
    }
    const { email, username, fullName, password } = req.body || {};
    if (!email || !fullName || typeof password !== "string" || password.length < 12) {
      return res.status(400).json({ code: "DADOS_INVALIDOS", message: "Nome, email e senha de ao menos 12 caracteres são obrigatórios." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(731904221)");
      const existing = await client.query("SELECT id FROM users WHERE role='superadmin' LIMIT 1");
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "SUPERADMIN_JA_EXISTE", message: "O superadministrador inicial já foi criado." });
      }
      const hash = await bcrypt.hash(password, 12);
      const result = await client.query(
        `INSERT INTO users (username,email,password,full_name,role,clinic_id,is_active,token_version)
         VALUES ($1,$2,$3,$4,'superadmin',NULL,true,0)
         RETURNING id,email,username,full_name AS "fullName",role,clinic_id AS "clinicId",is_active AS "isActive",created_at AS "createdAt"`,
        [username || email, email, hash, fullName],
      );
      await client.query("COMMIT");
      return res.status(201).json(result.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return res.status(409).json({ code: "IDENTIDADE_JA_USADA", message: "Email ou usuário já cadastrado." });
      return res.status(500).json({ code: "ERRO_BOOTSTRAP", message: "Não foi possível criar o superadministrador." });
    } finally {
      client.release();
    }
  });

  app.get("/api/admin/clinics", ...superadminOnly, async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !["active", "suspended"].includes(status)) return res.status(400).json({ code: "FILTRO_INVALIDO", message: "Status inválido." });
    res.json(await listClinics({ ...pageParams(req), search: stringQuery(req.query.search), status }));
  });

  app.get("/api/admin/clinics/:clinicId", ...superadminOnly, async (req, res) => {
    const detail = await getClinicDetail(req.params.clinicId);
    if (!detail) return res.status(404).json({ code: "CLINICA_NAO_ENCONTRADA", message: "Clínica não encontrada." });
    res.json(detail);
  });

  app.post("/api/admin/clinics/:clinicId/suspend", ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) return res.status(400).json({ code: "MOTIVO_OBRIGATORIO", message: "Informe o motivo da suspensão." });
    const clinic = await setClinicStatus(req.params.clinicId, "suspended", req.user!.id, reason);
    if (!clinic) return res.status(404).json({ code: "CLINICA_NAO_ENCONTRADA", message: "Clínica não encontrada." });
    res.json(clinic);
  });

  app.post("/api/admin/clinics/:clinicId/reactivate", ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    const clinic = await setClinicStatus(req.params.clinicId, "active", req.user!.id);
    if (!clinic) return res.status(404).json({ code: "CLINICA_NAO_ENCONTRADA", message: "Clínica não encontrada." });
    res.json(clinic);
  });

  app.patch("/api/admin/clinics/:clinicId/users/:userId/status", ...superadminOnly, async (req, res) => {
    if (typeof req.body?.isActive !== "boolean") return res.status(400).json({ code: "DADOS_INVALIDOS", message: "isActive deve ser booleano." });
    const rows = await queryRows("SELECT id, role FROM users WHERE id=$1 AND clinic_id=$2", [req.params.userId, req.params.clinicId]);
    if (!rows.length || rows[0].role === "superadmin") return res.status(404).json({ code: "USUARIO_NAO_ENCONTRADO", message: "Usuário da clínica não encontrado." });
    res.json(await setUserActive(req.params.userId, req.body.isActive));
  });

  app.get("/api/admin/audit-logs", ...superadminOnly, async (req, res) => {
    res.json(await listAudits({
      ...pageParams(req), event: stringQuery(req.query.event), clinicId: stringQuery(req.query.clinicId),
      userId: stringQuery(req.query.userId), search: stringQuery(req.query.search),
      from: dateQuery(req.query.from), to: dateQuery(req.query.to, true),
    }));
  });

  app.get("/api/admin/consumption", ...superadminOnly, async (req, res) => {
    const clinicId = stringQuery(req.query.clinicId);
    const rows = await queryRows(`
      SELECT c.id AS clinic_id, c.name,
        (SELECT count(*)::int FROM patients p WHERE p.clinic_id=c.id) patients,
        (SELECT count(*)::int FROM appointments a WHERE a.clinic_id=c.id) appointments,
        (SELECT count(*)::int FROM whatsapp_messages m JOIN whatsapp_conversations wc ON wc.id=m.conversation_id WHERE wc.clinic_id=c.id) messages,
        (SELECT count(*)::int FROM users u WHERE u.clinic_id=c.id AND u.role='dentist') dentists,
        (SELECT count(*)::int FROM users u WHERE u.clinic_id=c.id AND u.role='secretary') secretaries,
        (SELECT count(*)::int FROM whatsapp_instances wi WHERE wi.clinic_id=c.id) whatsapp_instances,
        (SELECT count(*)::int FROM whatsapp_instances wi WHERE wi.clinic_id=c.id AND wi.connected_phone IS NOT NULL) active_whatsapp,
        (SELECT count(*)::int FROM whatsapp_messages m JOIN whatsapp_conversations wc ON wc.id=m.conversation_id WHERE wc.clinic_id=c.id AND m.direction='outbound') whatsapp_requests,
        COALESCE((SELECT sum(a.prompt_tokens)::int FROM ai_usage_records a WHERE a.clinic_id=c.id), 0) ai_prompt_tokens,
        COALESCE((SELECT sum(a.completion_tokens)::int FROM ai_usage_records a WHERE a.clinic_id=c.id), 0) ai_completion_tokens,
        COALESCE((SELECT sum(a.total_tokens)::int FROM ai_usage_records a WHERE a.clinic_id=c.id), 0) ai_tokens
      FROM clinics c WHERE ($1::text IS NULL OR c.id=$1) ORDER BY c.name`, [clinicId || null]);
    res.json({
      data: rows,
      availability: {
        patients: { available: true, estimated: false }, appointments: { available: true, estimated: false },
        messages: { available: true, estimated: false },
        roles: { available: true, estimated: false },
        whatsapp: { available: true, estimated: false },
        aiTokens: { available: true, estimated: false, historicalCoverage: "Contabilizado a partir da ativação do painel Superadmin." },
        objectStorageBytes: { available: false, estimated: false, reason: "O provedor atual não fornece medição persistida por clínica." },
      },
    });
  });

  app.post("/api/admin/clinics/:clinicId/export-jobs", ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    if (!await clinicExists(req.params.clinicId)) return res.status(404).json({ code: "CLINICA_NAO_ENCONTRADA", message: "Clínica não encontrada." });
    const job = await createJob("clinic_export", req.params.clinicId, req.user!.id, {});
    setImmediate(() => void processAdminJob(job.id));
    res.status(202).json(job);
  });

  app.post("/api/admin/clinics/:clinicId/cleanup-jobs", ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    const detail = await getClinicDetail(req.params.clinicId);
    if (!detail) return res.status(404).json({ code: "CLINICA_NAO_ENCONTRADA", message: "Clínica não encontrada." });
    const { modules, confirm, typedClinicName, confirmationPhrase } = req.body || {};
    if (confirm !== true || typedClinicName !== detail.clinic.name || confirmationPhrase !== `EXCLUIR ${detail.clinic.name}`) {
      return res.status(400).json({ code: "CONFIRMACAO_INSUFICIENTE", message: "Confirmação, nome exato da clínica e frase de confirmação são obrigatórios." });
    }
    if (!Array.isArray(modules) || !modules.length || modules.some((m) => !["appointments", "records", "messages", "patients"].includes(m))) {
      return res.status(400).json({ code: "MODULOS_INVALIDOS", message: "Selecione módulos válidos." });
    }
    const job = await createJob("clinic_cleanup", req.params.clinicId, req.user!.id, { modules });
    setImmediate(() => void processAdminJob(job.id));
    res.status(202).json(job);
  });

  app.post("/api/admin/clinics/:clinicId/orphan-media/scan", ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    if (!await clinicExists(req.params.clinicId)) return res.status(404).json({ code: "CLINICA_NAO_ENCONTRADA", message: "Clínica não encontrada." });
    const job = await createJob("orphan_media_scan", req.params.clinicId, req.user!.id, { dryRun: true });
    setImmediate(() => void processAdminJob(job.id));
    res.status(202).json(job);
  });

  app.post("/api/admin/clinics/:clinicId/orphan-media/cleanup", ...superadminOnly, async (req: AuthenticatedRequest, res) => {
    const detail = await getClinicDetail(req.params.clinicId);
    if (!detail) return res.status(404).json({ code: "CLINICA_NAO_ENCONTRADA", message: "Clínica não encontrada." });
    if (req.body?.confirm !== true || req.body?.typedClinicName !== detail.clinic.name || typeof req.body?.scanJobId !== "string") {
      return res.status(400).json({ code: "CONFIRMACAO_INSUFICIENTE", message: "Confirmação, nome exato da clínica e uma varredura concluída são obrigatórios." });
    }
    const scan = await getJob(req.body.scanJobId);
    if (!scan || scan.clinicId !== req.params.clinicId || scan.type !== "orphan_media_scan" || scan.status !== "completed") {
      return res.status(400).json({ code: "VARREDURA_INVALIDA", message: "A varredura informada não está concluída ou não pertence a esta clínica." });
    }
    const objects = Array.isArray((scan.result as any)?.objects) ? (scan.result as any).objects : [];
    const job = await createJob("orphan_media_cleanup", req.params.clinicId, req.user!.id, {
      confirm: true,
      scanJobId: scan.id,
      objects,
    });
    setImmediate(() => void processAdminJob(job.id));
    res.status(202).json(job);
  });

  app.get("/api/admin/jobs/:jobId", ...superadminOnly, async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job) return res.status(404).json({ code: "JOB_NAO_ENCONTRADO", message: "Tarefa não encontrada." });
    res.json(job);
  });

  app.get("/api/admin/jobs/:jobId/download", ...superadminOnly, async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || job.type !== "clinic_export" || job.status !== "completed") {
      return res.status(404).json({ code: "ARQUIVO_NAO_DISPONIVEL", message: "Exportação não disponível." });
    }
    const file = getExportPath(job.id);
    try {
      await fs.access(file);
      res.download(file, `denticare-${job.clinicId}-${job.id}.zip`);
    } catch {
      res.status(410).json({ code: "ARQUIVO_EXPIRADO", message: "O arquivo da exportação não está mais disponível." });
    }
  });

  void resumePendingAdminJobs().catch((error) => console.error("Falha ao retomar tarefas administrativas:", error));
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function stringQuery(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function dateQuery(value: unknown, endOfDay = false) {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setHours(23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
async function clinicExists(id: string) { return (await queryRows("SELECT 1 FROM clinics WHERE id=$1", [id])).length > 0; }