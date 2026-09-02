import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { accessAuditLogs, adminJobs, clinics, users } from "@shared/schema";
import { db, pool } from "../db";

export type AuditInput = {
  event: "login_success" | "login_failure" | "login_blocked";
  userId?: string;
  clinicId?: string | null;
  attemptedEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
};

export async function recordAccessAudit(input: AuditInput) {
  await db.insert(accessAuditLogs).values(input);
}

export async function listClinics(input: { page: number; pageSize: number; search?: string; status?: string }) {
  const offset = (input.page - 1) * input.pageSize;
  const conditions = [];
  if (input.search) conditions.push(or(ilike(clinics.name, `%${input.search}%`), ilike(clinics.email, `%${input.search}%`)));
  if (input.status) conditions.push(eq(clinics.status, input.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(clinics).where(where);
  const rows = await db.execute(sql`
    SELECT c.id, c.name, c.email, c.phone, c.status, c.created_at AS "createdAt",
      c.suspended_at AS "suspendedAt", c.suspension_reason AS "suspensionReason",
      owner.id AS "ownerId", owner.full_name AS "ownerName", owner.email AS "ownerEmail",
      (SELECT count(*)::int FROM users u WHERE u.clinic_id=c.id) AS "userCount",
      (SELECT count(*)::int FROM users u WHERE u.clinic_id=c.id AND u.is_active) AS "activeUserCount",
      (SELECT count(*)::int FROM users u WHERE u.clinic_id=c.id AND u.role='dentist') AS "dentistCount",
      (SELECT count(*)::int FROM users u WHERE u.clinic_id=c.id AND u.role='secretary') AS "secretaryCount",
      (SELECT count(*)::int FROM patients p WHERE p.clinic_id=c.id) AS "patientCount",
      (SELECT count(*)::int FROM appointments a WHERE a.clinic_id=c.id) AS "appointmentCount",
      (SELECT count(*)::int FROM whatsapp_instances wi WHERE wi.clinic_id=c.id) AS "whatsappInstanceCount",
      (SELECT count(*)::int FROM whatsapp_instances wi WHERE wi.clinic_id=c.id AND wi.connected_phone IS NOT NULL) AS "activeWhatsappCount",
      (SELECT count(*)::int FROM whatsapp_messages wm JOIN whatsapp_conversations wc ON wc.id=wm.conversation_id WHERE wc.clinic_id=c.id AND wm.direction='outbound') AS "whatsappRequestCount",
      (SELECT max(a.scheduled_date) FROM appointments a WHERE a.clinic_id=c.id) AS "lastAppointmentAt"
    FROM clinics c
    LEFT JOIN LATERAL (
      SELECT u.id, u.full_name, u.email FROM users u
      WHERE u.clinic_id=c.id AND u.role='admin' ORDER BY u.created_at LIMIT 1
    ) owner ON true
    WHERE (${input.status || null}::text IS NULL OR c.status=${input.status || null})
      AND (${input.search || null}::text IS NULL OR c.name ILIKE ${`%${input.search || ""}%`} OR c.email ILIKE ${`%${input.search || ""}%`})
    ORDER BY c.created_at DESC LIMIT ${input.pageSize} OFFSET ${offset}
  `);
  return { data: rows.rows, pagination: { page: input.page, pageSize: input.pageSize, totalCount: total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function getClinicDetail(id: string) {
  const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, id) });
  if (!clinic) return undefined;
  const clinicUsers = await db.select({
    id: users.id, username: users.username, email: users.email, fullName: users.fullName,
    role: users.role, clinicId: users.clinicId, isActive: users.isActive, createdAt: users.createdAt,
  }).from(users).where(eq(users.clinicId, id)).orderBy(users.createdAt);
  const metrics = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM patients WHERE clinic_id=$1) patients,
      (SELECT count(*)::int FROM appointments WHERE clinic_id=$1) appointments,
      (SELECT count(*)::int FROM medical_records WHERE clinic_id=$1) records,
      (SELECT count(*)::int FROM treatments WHERE clinic_id=$1) treatments,
      (SELECT count(*)::int FROM whatsapp_conversations WHERE clinic_id=$1) conversations,
      (SELECT count(*)::int FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id=m.conversation_id WHERE c.clinic_id=$1) messages,
      (SELECT count(*)::int FROM users WHERE clinic_id=$1 AND role='dentist') dentists,
      (SELECT count(*)::int FROM users WHERE clinic_id=$1 AND role='secretary') secretaries,
      (SELECT count(*)::int FROM whatsapp_instances WHERE clinic_id=$1) whatsapp_instances,
      (SELECT count(*)::int FROM whatsapp_instances WHERE clinic_id=$1 AND connected_phone IS NOT NULL) active_whatsapp
  `, [id]);
  return { clinic: sanitizeClinic(clinic), users: clinicUsers, metrics: metrics.rows[0] };
}

export async function setClinicStatus(id: string, status: "active" | "suspended", actorId: string, reason?: string) {
  const [row] = await db.update(clinics).set(status === "suspended"
    ? { status, suspendedAt: new Date(), suspendedBy: actorId, suspensionReason: reason || null }
    : { status, suspendedAt: null, suspendedBy: null, suspensionReason: null })
    .where(eq(clinics.id, id)).returning();
  return row && sanitizeClinic(row);
}

export async function setUserActive(id: string, active: boolean) {
  const [row] = await db.update(users).set({ isActive: active, tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, id)).returning({
      id: users.id, email: users.email, fullName: users.fullName, role: users.role,
      clinicId: users.clinicId, isActive: users.isActive, tokenVersion: users.tokenVersion,
    });
  return row;
}

export async function listAudits(input: {
  page: number; pageSize: number; event?: string; clinicId?: string; userId?: string; search?: string; from?: Date; to?: Date;
}) {
  const conditions = [];
  if (input.event) conditions.push(eq(accessAuditLogs.event, input.event));
  if (input.clinicId) conditions.push(eq(accessAuditLogs.clinicId, input.clinicId));
  if (input.userId) conditions.push(eq(accessAuditLogs.userId, input.userId));
  if (input.search) conditions.push(or(
    ilike(accessAuditLogs.attemptedEmail, `%${input.search}%`),
    ilike(accessAuditLogs.ipAddress, `%${input.search}%`),
    ilike(accessAuditLogs.reason, `%${input.search}%`),
  ));
  if (input.from) conditions.push(gte(accessAuditLogs.createdAt, input.from));
  if (input.to) conditions.push(lte(accessAuditLogs.createdAt, input.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(accessAuditLogs).where(where);
  const data = await db.select().from(accessAuditLogs).where(where).orderBy(desc(accessAuditLogs.createdAt))
    .limit(input.pageSize).offset((input.page - 1) * input.pageSize);
  return { data, pagination: { page: input.page, pageSize: input.pageSize, totalCount: total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function createJob(type: string, clinicId: string | null, actorUserId: string, payload: Record<string, unknown>) {
  const [job] = await db.insert(adminJobs).values({ type, clinicId, actorUserId, payload }).returning();
  return job;
}

export async function updateJob(id: string, values: Partial<typeof adminJobs.$inferInsert>) {
  const [job] = await db.update(adminJobs).set(values).where(eq(adminJobs.id, id)).returning();
  return job;
}

export async function claimJob(id: string) {
  const [job] = await db.update(adminJobs)
    .set({ status: "running", progress: 1, startedAt: new Date(), error: null })
    .where(and(eq(adminJobs.id, id), eq(adminJobs.status, "queued")))
    .returning();
  return job;
}

export async function getJob(id: string) {
  return db.query.adminJobs.findFirst({ where: eq(adminJobs.id, id) });
}

export async function queryRows(query: string, values: unknown[] = []) {
  return (await pool.query(query, values)).rows;
}

function sanitizeClinic<T extends Record<string, any>>(clinic: T) {
  const { evolutionApiKey, ...safe } = clinic;
  return safe;
}