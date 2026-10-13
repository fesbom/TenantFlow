import type { Express } from "express";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  clinics,
  communicationLogs,
  communicationReasons,
  medicalRecords,
  patients,
  treatments,
} from "@shared/schema";
import { db } from "./db";
import { sendEvolutionMessageForClinic, type ClinicEvolutionConfig } from "./evolutionService";
import { authenticateToken, requireRole, type AuthenticatedRequest } from "./middleware/auth";
import { storage } from "./storage";

const STAFF_ROLES = ["admin", "dentist", "secretary"];
const SYSTEM_REASON_DEFAULTS = [
  { triggerType: "birthday", name: "Aniversário", messageTemplate: "Olá, {primeiro_nome}! A {clinica} deseja um feliz aniversário! 🎉" },
  { triggerType: "inactivity_6m", name: "Retorno preventivo", messageTemplate: "Olá, {primeiro_nome}! Já faz algum tempo desde sua última consulta na {clinica}. Que tal agendar sua avaliação preventiva?" },
  { triggerType: "treatment_completed", name: "Avaliação pós-tratamento", messageTemplate: "Olá, {primeiro_nome}! Esperamos que esteja bem. Como foi sua experiência com o tratamento na {clinica}? Sua avaliação é muito importante para nós." },
] as const;
const triggerTypes = ["birthday", "inactivity_6m", "treatment_completed", "manual"] as const;

const reasonPayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(triggerTypes),
  messageTemplate: z.string().trim().min(1).max(4000),
  isActive: z.boolean().optional(),
});

const dispatchSchema = z.object({
  patientIds: z.array(z.string().min(1)).min(1).max(1000),
  reasonId: z.string().min(1).nullable().optional(),
  message: z.string().trim().min(1).max(4000),
  delaySeconds: z.number().min(2).max(5).optional(),
});

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function renderTemplate(template: string, patientName: string, clinicName: string): string {
  return template
    .replaceAll("{nome}", patientName)
    .replaceAll("{primeiro_nome}", firstName(patientName))
    .replaceAll("{clinica}", clinicName);
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function selectRandomInstance<T>(instances: T[]): T {
  return instances[Math.floor(Math.random() * instances.length)];
}

async function resolveCommunicationConfig(clinicId: string): Promise<ClinicEvolutionConfig> {
  const instances = await storage.getWhatsappInstancesByClinic(clinicId);
  const clinic = await storage.getClinicById(clinicId);
  if (!clinic) throw new Error("Clínica não encontrada.");

  if (clinic.simulationMode) {
    const simulationInstance = instances.length > 0 ? selectRandomInstance(instances) : undefined;
    return {
      evoUrl: "",
      evoKey: "",
      instanceName: simulationInstance?.instanceName ?? "simulation",
      clinicId,
      simulated: true,
    };
  }

  const connectedInstances = instances.filter((instance) => instance.connectedPhone);
  if (connectedInstances.length === 0) {
    throw new Error(
      "Nenhum número de WhatsApp conectado foi configurado para esta clínica. Configure e conecte um número em Configurações > WhatsApp antes de enviar comunicações.",
    );
  }
  const selectedInstance = selectRandomInstance(connectedInstances);

  return {
    evoUrl: (process.env.EVO_URL || "").replace(/\/+$/, ""),
    evoKey: (selectedInstance.apiKey || process.env.EVO_KEY || "").trim(),
    instanceName: selectedInstance.instanceName,
    clinicId,
  };
}

async function ensureSystemReasons(clinicId: string): Promise<void> {
  for (const reason of SYSTEM_REASON_DEFAULTS) {
    const [existing] = await db
      .select({ id: communicationReasons.id })
      .from(communicationReasons)
      .where(and(
        eq(communicationReasons.clinicId, clinicId),
        eq(communicationReasons.triggerType, reason.triggerType),
        eq(communicationReasons.isSystemDefault, true),
      ))
      .limit(1);
    if (!existing) {
      await db.insert(communicationReasons).values({
        clinicId,
        name: reason.name,
        triggerType: reason.triggerType,
        messageTemplate: reason.messageTemplate,
        isSystemDefault: true,
      });
    }
  }
}

async function persistOutboundChatMessage(params: {
  clinicId: string;
  patientId: string;
  phone: string;
  instanceName: string;
  text: string;
  externalMessageId?: string;
  simulated?: boolean;
}): Promise<void> {
  let conversation = await storage.getWhatsappConversationByPhone(
    params.clinicId,
    params.phone,
    params.instanceName,
  );
  if (!conversation) {
    // Closed is neutral: active communication must never create a reception-queue item.
    conversation = await storage.createWhatsappConversation({
      clinicId: params.clinicId,
      patientId: params.patientId,
      phone: params.phone,
      instanceName: params.instanceName,
      status: "closed",
    });
  }
  await storage.createWhatsappMessage({
    conversationId: conversation.id,
    sender: "staff",
    direction: "outbound",
    text: params.text,
    externalMessageId: params.externalMessageId,
    isSimulated: params.simulated,
  });
}

async function sendCommunication(params: {
  clinicId: string;
  patient: { id: string; fullName: string; phone: string };
  reasonId?: string | null;
  treatmentId?: string | null;
  template: string;
}): Promise<{ status: "sent" | "failed" | "simulated"; error?: string }> {
  const [clinic] = await db.select({ name: clinics.name }).from(clinics).where(eq(clinics.id, params.clinicId)).limit(1);
  if (!clinic) throw new Error("Clínica não encontrada.");
  const phone = normalizePhone(params.patient.phone);
  const text = renderTemplate(params.template, params.patient.fullName, clinic.name);
  const [log] = await db.insert(communicationLogs).values({
    clinicId: params.clinicId,
    patientId: params.patient.id,
    reasonId: params.reasonId ?? null,
    treatmentId: params.treatmentId ?? null,
    recipientPhone: phone,
    messageSent: text,
    status: "pending",
  }).returning();

  let config: ClinicEvolutionConfig;
  try {
    config = await resolveCommunicationConfig(params.clinicId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível identificar uma instância do WhatsApp.";
    await db.update(communicationLogs).set({ status: "failed", error: message }).where(eq(communicationLogs.id, log.id));
    return { status: "failed", error: message };
  }

  const result = await sendEvolutionMessageForClinic(config, phone, text);
  const status = result.success ? (result.simulated ? "simulated" : "sent") : "failed";
  await db.update(communicationLogs).set({
    status,
    evolutionMessageId: result.messageId ?? null,
    error: result.error ?? null,
    sentAt: result.success ? new Date() : null,
  }).where(eq(communicationLogs.id, log.id));

  await persistOutboundChatMessage({
    clinicId: params.clinicId,
    patientId: params.patient.id,
    phone,
    instanceName: config.instanceName,
    text,
    externalMessageId: result.messageId,
    simulated: result.simulated,
  });
  return { status, error: result.error };
}

async function getActiveReason(clinicId: string, triggerType: (typeof triggerTypes)[number]) {
  const [reason] = await db.select().from(communicationReasons).where(and(
    eq(communicationReasons.clinicId, clinicId),
    eq(communicationReasons.triggerType, triggerType),
    eq(communicationReasons.isSystemDefault, true),
    eq(communicationReasons.isActive, true),
    isNull(communicationReasons.deletedAt),
  )).limit(1);
  return reason;
}

async function hasSuccessfulLog(clinicId: string, patientId: string, reasonId: string, since: Date): Promise<boolean> {
  const [row] = await db.select({ id: communicationLogs.id }).from(communicationLogs).where(and(
    eq(communicationLogs.clinicId, clinicId),
    eq(communicationLogs.patientId, patientId),
    eq(communicationLogs.reasonId, reasonId),
    gte(communicationLogs.sentAt, since),
    sql`${communicationLogs.status} IN ('sent', 'simulated')`,
  )).limit(1);
  return !!row;
}

async function runAutomaticCommunications(): Promise<void> {
  const clinicRows = await db.select({ id: clinics.id }).from(clinics);
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const inactivityCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  for (const { id: clinicId } of clinicRows) {
    await ensureSystemReasons(clinicId);
    const birthdayReason = await getActiveReason(clinicId, "birthday");
    if (birthdayReason) {
      const birthdayPatients = await db.select().from(patients).where(and(
        eq(patients.clinicId, clinicId),
        sql`EXTRACT(MONTH FROM ${patients.birthDate}) = ${now.getMonth() + 1}`,
        sql`EXTRACT(DAY FROM ${patients.birthDate}) = ${now.getDate()}`,
      ));
      for (const patient of birthdayPatients) {
        if (!(await hasSuccessfulLog(clinicId, patient.id, birthdayReason.id, startOfYear))) {
          await sendCommunication({ clinicId, patient, reasonId: birthdayReason.id, template: birthdayReason.messageTemplate });
        }
      }
    }

    const inactivityReason = await getActiveReason(clinicId, "inactivity_6m");
    if (inactivityReason) {
      const inactivePatients = await db.execute(sql`
        SELECT p.id, p.full_name AS "fullName", p.phone
        FROM patients p
        WHERE p.clinic_id = ${clinicId}
          AND p.phone IS NOT NULL
          AND COALESCE(
            GREATEST(
              (SELECT MAX(a.scheduled_date) FROM appointments a WHERE a.patient_id = p.id AND a.clinic_id = p.clinic_id AND a.status IN ('completed', 'confirmed', 'in_progress')),
              (SELECT MAX(m.created_at) FROM medical_records m WHERE m.patient_id = p.id AND m.clinic_id = p.clinic_id)
            ),
            p.created_at
          ) <= ${inactivityCutoff}
      `);
      for (const patient of inactivePatients.rows as Array<{ id: string; fullName: string; phone: string }>) {
        if (!(await hasSuccessfulLog(clinicId, patient.id, inactivityReason.id, inactivityCutoff))) {
          await sendCommunication({ clinicId, patient, reasonId: inactivityReason.id, template: inactivityReason.messageTemplate });
        }
      }
    }

    const treatmentReason = await getActiveReason(clinicId, "treatment_completed");
    if (treatmentReason) {
      const rows = await db.select({ treatment: treatments, patient: patients }).from(treatments)
        .innerJoin(patients, eq(patients.id, treatments.patientId))
        .where(and(
          eq(treatments.clinicId, clinicId),
          eq(treatments.avaliado, false),
          sql`LOWER(${treatments.situacaoTratamento}) IN ('concluído', 'concluido')`,
        ));
      for (const { treatment, patient } of rows) {
        const result = await sendCommunication({
          clinicId,
          patient,
          reasonId: treatmentReason.id,
          treatmentId: treatment.id,
          template: treatmentReason.messageTemplate,
        });
        if (result.status === "sent" || result.status === "simulated") {
          await db.update(treatments).set({ avaliado: true, avaliadoAt: new Date() }).where(eq(treatments.id, treatment.id));
        }
      }
    }
  }
}

export function registerPatientCommunicationRoutes(app: Express): void {
  app.get("/api/communications/reasons", authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
    const clinicId = (req as AuthenticatedRequest).user!.clinicId;
    await ensureSystemReasons(clinicId);
    const includeArchived = req.query.archived === "true";
    const rows = await db.select().from(communicationReasons).where(and(
      eq(communicationReasons.clinicId, clinicId),
      includeArchived ? sql`TRUE` : isNull(communicationReasons.deletedAt),
    )).orderBy(asc(communicationReasons.name));
    res.json(rows);
  });

  app.post("/api/communications/reasons", authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
    const parsed = reasonPayloadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados de motivo inválidos.", errors: parsed.error.flatten() });
    const clinicId = (req as AuthenticatedRequest).user!.clinicId;
    const [reason] = await db.insert(communicationReasons).values({ clinicId, ...parsed.data, isActive: parsed.data.isActive ?? true }).returning();
    res.status(201).json(reason);
  });

  app.patch("/api/communications/reasons/:id", authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
    const parsed = reasonPayloadSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados de motivo inválidos.", errors: parsed.error.flatten() });
    const clinicId = (req as AuthenticatedRequest).user!.clinicId;
    const [existing] = await db.select().from(communicationReasons).where(and(
      eq(communicationReasons.id, req.params.id),
      eq(communicationReasons.clinicId, clinicId),
      isNull(communicationReasons.deletedAt),
    )).limit(1);
    if (!existing) return res.status(404).json({ message: "Motivo não encontrado." });
    if (existing.isSystemDefault && parsed.data.triggerType && parsed.data.triggerType !== existing.triggerType) {
      return res.status(400).json({ message: "O gatilho de um motivo nativo não pode ser alterado." });
    }
    const [reason] = await db.update(communicationReasons).set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(communicationReasons.id, existing.id)).returning();
    res.json(reason);
  });

  app.delete("/api/communications/reasons/:id", authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
    const clinicId = (req as AuthenticatedRequest).user!.clinicId;
    const [reason] = await db.select().from(communicationReasons).where(and(eq(communicationReasons.id, req.params.id), eq(communicationReasons.clinicId, clinicId))).limit(1);
    if (!reason) return res.status(404).json({ message: "Motivo não encontrado." });
    const [log] = await db.select({ id: communicationLogs.id }).from(communicationLogs).where(eq(communicationLogs.reasonId, reason.id)).limit(1);
    if (reason.isSystemDefault) {
      const [deactivated] = await db.update(communicationReasons).set({ isActive: false, updatedAt: new Date() }).where(eq(communicationReasons.id, reason.id)).returning();
      return res.json({ deactivated: true, reason: deactivated });
    }
    if (log) {
      const [archived] = await db.update(communicationReasons).set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() }).where(eq(communicationReasons.id, reason.id)).returning();
      return res.json({ archived: true, reason: archived });
    }
    await db.delete(communicationReasons).where(eq(communicationReasons.id, reason.id));
    res.status(204).end();
  });

  app.get("/api/communications/patients", authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
    const clinicId = (req as AuthenticatedRequest).user!.clinicId;
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    const neighborhood = typeof req.query.neighborhood === "string" ? req.query.neighborhood.trim() : "";
    const sex = typeof req.query.sex === "string" ? req.query.sex.trim() : "";
    const minAge = Number(req.query.minAge);
    const maxAge = Number(req.query.maxAge);
    const filters = [eq(patients.clinicId, clinicId)];
    if (name) filters.push(ilike(patients.fullName, `%${name}%`));
    if (city) filters.push(ilike(patients.city, `%${city}%`));
    if (neighborhood) filters.push(ilike(patients.neighborhood, `%${neighborhood}%`));
    if (sex) filters.push(eq(patients.sex, sex));
    if (Number.isFinite(minAge)) filters.push(sql`${patients.birthDate} <= CURRENT_DATE - (${Math.max(0, minAge)} * INTERVAL '1 year')`);
    if (Number.isFinite(maxAge)) filters.push(sql`${patients.birthDate} >= CURRENT_DATE - (${Math.max(0, maxAge + 1)} * INTERVAL '1 year')`);
    const rows = await db.select({ id: patients.id, fullName: patients.fullName, phone: patients.phone, birthDate: patients.birthDate, city: patients.city, neighborhood: patients.neighborhood, sex: patients.sex })
      .from(patients).where(and(...filters)).orderBy(asc(patients.fullName)).limit(200);
    res.json(rows);
  });

  app.post("/api/communications/dispatch", authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
    try {
      const parsed = dispatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dados de envio inválidos.", errors: parsed.error.flatten() });
      const clinicId = (req as AuthenticatedRequest).user!.clinicId;
      const reasonId: string | null = parsed.data.reasonId ?? null;
      if (reasonId) {
        const [reason] = await db.select({ id: communicationReasons.id }).from(communicationReasons).where(and(eq(communicationReasons.id, reasonId), eq(communicationReasons.clinicId, clinicId), isNull(communicationReasons.deletedAt))).limit(1);
        if (!reason) return res.status(400).json({ message: "Motivo inválido para esta clínica." });
      }
      const selectedPatients = await db.select({ id: patients.id, fullName: patients.fullName, phone: patients.phone }).from(patients)
        .where(and(eq(patients.clinicId, clinicId), inArray(patients.id, parsed.data.patientIds)));
      if (selectedPatients.length !== parsed.data.patientIds.length) return res.status(400).json({ message: "Um ou mais pacientes não pertencem à clínica." });

      const results: Array<{ patientId: string; status: string; error?: string }> = [];
      for (let index = 0; index < selectedPatients.length; index += 1) {
        const patient = selectedPatients[index];
        const result = await sendCommunication({ clinicId, patient, reasonId, template: parsed.data.message });
        results.push({ patientId: patient.id, ...result });
        if (index < selectedPatients.length - 1) await delay((parsed.data.delaySeconds ?? 2) * 1000);
      }
      res.status(202).json({ results });
    } catch (error) {
      console.error("[COMUNICAÇÕES] Falha no disparo manual:", error);
      res.status(500).json({ message: "Não foi possível processar o disparo. Tente novamente." });
    }
  });

  app.get("/api/communications/logs", authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
    const clinicId = (req as AuthenticatedRequest).user!.clinicId;
    const start = typeof req.query.startDate === "string" ? new Date(req.query.startDate) : undefined;
    const end = typeof req.query.endDate === "string" ? new Date(`${req.query.endDate}T23:59:59.999`) : undefined;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : "";
    const patientName = typeof req.query.patientName === "string" ? req.query.patientName.trim() : "";
    const reasonId = typeof req.query.reasonId === "string" ? req.query.reasonId : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const filters = [eq(communicationLogs.clinicId, clinicId)];
    if (start && !Number.isNaN(start.getTime())) filters.push(gte(communicationLogs.createdAt, start));
    if (end && !Number.isNaN(end.getTime())) filters.push(lte(communicationLogs.createdAt, end));
    if (patientId) filters.push(eq(communicationLogs.patientId, patientId));
    if (patientName) filters.push(ilike(patients.fullName, `%${patientName}%`));
    if (reasonId) filters.push(eq(communicationLogs.reasonId, reasonId));
    if (status) filters.push(eq(communicationLogs.status, status));
    const rows = await db.select({ log: communicationLogs, patientName: patients.fullName, reasonName: communicationReasons.name })
      .from(communicationLogs).innerJoin(patients, eq(patients.id, communicationLogs.patientId))
      .leftJoin(communicationReasons, eq(communicationReasons.id, communicationLogs.reasonId))
      .where(and(...filters)).orderBy(desc(communicationLogs.createdAt)).limit(500);
    res.json(rows.map(({ log, patientName, reasonName }) => ({ ...log, patientName, reasonName })));
  });

  void runAutomaticCommunications().catch((error) => console.error("[COMUNICAÇÕES] Falha na execução inicial:", error));
  setInterval(() => void runAutomaticCommunications().catch((error) => console.error("[COMUNICAÇÕES] Falha na rotina diária:", error)), 24 * 60 * 60 * 1000);
}
