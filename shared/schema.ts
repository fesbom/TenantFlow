import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, date, decimal, unique, jsonb, index, check } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Password reset tokens table - defined here to avoid circular imports
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: varchar("token").notNull().unique(),
  isUsed: boolean("is_used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Clinics table - each clinic is a tenant
export const clinics = pgTable("clinics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  logoUrl: text("logo_url"),
  // WhatsApp / Evolution API per-clinic config
  evolutionInstanceName: text("evolution_instance_name"),
  evolutionApiKey: text("evolution_api_key"),
  evolutionConnectedPhone: text("evolution_connected_phone"),
  // Nota Fiscal — campos habilitados para cópia rápida (JSON array of field keys)
  invoiceFields: text("invoice_fields"),
  status: text("status").default("active").notNull(), // active | suspended
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by"),
  suspensionReason: text("suspension_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  check("clinics_status_check", sql`${t.status} IN ('active', 'suspended')`),
]);

// Users table with clinic association and roles
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(), // 'admin', 'dentist', 'secretary'
  clinicId: varchar("clinic_id").references(() => clinics.id),
  externalId: text("external_id").unique(), // ID from legacy system for import deduplication
  isActive: boolean("is_active").default(true).notNull(),
  tokenVersion: integer("token_version").default(0).notNull(),
  defaultAppointmentDuration: integer("default_appointment_duration"), // Default duration in minutes for dentist appointments
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Authentication/security audit. Never stores credentials or bearer tokens.
export const accessAuditLogs = pgTable("access_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  event: text("event").notNull(), // login_success | login_failure | login_blocked
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  clinicId: varchar("clinic_id").references(() => clinics.id, { onDelete: "set null" }),
  attemptedEmail: text("attempted_email"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("access_audit_created_idx").on(t.createdAt),
  index("access_audit_clinic_idx").on(t.clinicId),
  index("access_audit_user_idx").on(t.userId),
]);

// Persisted Gemini usage attributed to a clinic. Historical usage before this
// table was introduced is intentionally not reconstructed.
export const aiUsageRecords = pgTable("ai_usage_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("ai_usage_clinic_created_idx").on(t.clinicId, t.createdAt),
]);

// Durable queue/state for privileged exports and destructive cleanup operations.
export const adminJobs = pgTable("admin_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // clinic_export | clinic_cleanup | orphan_media_scan | orphan_media_cleanup
  status: text("status").default("queued").notNull(), // queued | running | completed | failed
  progress: integer("progress").default(0).notNull(),
  clinicId: varchar("clinic_id").references(() => clinics.id, { onDelete: "set null" }),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("admin_jobs_actor_idx").on(t.actorUserId),
  index("admin_jobs_clinic_idx").on(t.clinicId),
  index("admin_jobs_status_idx").on(t.status),
  check("admin_jobs_status_check", sql`${t.status} IN ('queued', 'running', 'completed', 'failed')`),
  check("admin_jobs_progress_check", sql`${t.progress} BETWEEN 0 AND 100`),
]);

// Patients table with clinic isolation
export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  cpf: text("cpf"),
  rg: text("rg"), // Documento de Identidade (RG)
  email: text("email"),
  phone: text("phone").notNull(),
  workPhone: text("work_phone"), // Fone de Trabalho
  birthDate: date("birth_date"),
  birthCity: text("birth_city"), // Cidade de Nascimento
  maritalStatus: text("marital_status"), // Estado Civil
  
  // Endereço completo
  cep: text("cep"),
  address: text("address"), // Logradouro
  number: text("number"), // Número
  complement: text("complement"), // Complemento
  neighborhood: text("neighborhood"), // Bairro
  city: text("city"), // Cidade
  state: text("state"), // Estado
  
  // Vínculos e responsáveis
  responsibleDentistId: varchar("responsible_dentist_id").references(() => users.id), // Dentista Responsável
  responsibleName: text("responsible_name"), // Responsável (para menores)
  responsibleCpf: text("responsible_cpf"), // CPF do Responsável
  
  // Marketing e histórico
  howDidYouKnowUs: text("how_did_you_know_us"), // Como nos Conheceu
  howDidYouKnowUsOther: text("how_did_you_know_us_other"), // Especificação quando "Outros"
  lastVisitDate: date("last_visit_date"), // Data da Última Visita
  lastContactDate: date("last_contact_date"), // Último Contato
  
  externalId: text("external_id").unique(), // ID from legacy system for import deduplication
  medicalNotes: text("medical_notes"),
  photoUrl: text("photo_url"), // URL da foto do paciente
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Anamnesis questions - configurable per clinic
export const anamnesisQuestions = pgTable("anamnesis_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  type: text("type").notNull(), // 'text', 'boolean', 'multiple_choice'
  options: text("options"), // JSON string for multiple choice
  isRequired: boolean("is_required").default(false).notNull(),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Appointments table
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  dentistId: varchar("dentist_id").notNull().references(() => users.id),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  scheduledDate: timestamp("scheduled_date").notNull(),
  duration: integer("duration").default(60), // minutes
  procedure: text("procedure"),
  status: text("status").default('scheduled').notNull(), // 'scheduled', 'in_progress', 'completed', 'cancelled'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Medical records (prontuários)
export const medicalRecords = pgTable("medical_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  dentistId: varchar("dentist_id").notNull().references(() => users.id),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  procedure: text("procedure").notNull(),
  clinicalNotes: text("clinical_notes"),
  treatmentPlan: text("treatment_plan"),
  images: text("images"), // JSON array of image paths
  cost: decimal("cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Anamnesis responses - agora ligadas ao tratamento
export const anamnesisResponses = pgTable("anamnesis_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  questionId: varchar("question_id").notNull().references(() => anamnesisQuestions.id),
  treatmentId: varchar("treatment_id").references(() => treatments.id),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  response: text("response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Treatments - elemento central do prontuário
export const treatments = pgTable("treatments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  dentistId: varchar("dentist_id").notNull().references(() => users.id),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  dataInicio: date("data_inicio").notNull(),
  situacaoTratamento: text("situacao_tratamento").default('Em andamento').notNull(), // 'Em andamento', 'Concluído', 'Cancelado'
  tituloTratamento: text("titulo_tratamento").notNull(),
  externalId: text("external_id").unique(), // ID from legacy system for import deduplication
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Budget Items - itens detalhados do orçamento
export const budgetItems = pgTable("budget_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  treatmentId: varchar("treatment_id").notNull().references(() => treatments.id),
  descricaoOrcamento: text("descricao_orcamento").notNull(),
  valorOrcamento: decimal("valor_orcamento", { precision: 10, scale: 2 }).notNull(),
  externalId: text("external_id").unique(), // ID from legacy system for import deduplication
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Budget Summary - resumo do orçamento por tratamento
export const budgetSummary = pgTable("budget_summary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  treatmentId: varchar("treatment_id").notNull().references(() => treatments.id),
  subtotalOrcamento: decimal("subtotal_orcamento", { precision: 10, scale: 2 }).notNull(),
  descontoOrcamento: decimal("desconto_orcamento", { precision: 10, scale: 2 }).default('0').notNull(),
  totalOrcamento: decimal("total_orcamento", { precision: 10, scale: 2 }).notNull(),
  condicaoPagamento: text("condicao_pagamento"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Treatment Movements - movimentações/evolução do tratamento
export const treatmentMovements = pgTable("treatment_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  treatmentId: varchar("treatment_id").notNull().references(() => treatments.id),
  dataMovimentacao: date("data_movimentacao").notNull(),
  descricaoAtividade: text("descricao_atividade").notNull(),
  valorServico: decimal("valor_servico", { precision: 10, scale: 2 }).notNull(),
  fotoAtividade: text("foto_atividade"), // path para imagem
  region: text("region"), // Região tratada (opcional)
  toothNumber: text("tooth_number"), // Número do dente (opcional)
  externalId: text("external_id").unique(), // ID from legacy system for import deduplication
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Budgets/Orçamentos (mantido para compatibilidade)
export const budgets = pgTable("budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  dentistId: varchar("dentist_id").notNull().references(() => users.id),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  title: text("title").notNull(),
  procedures: text("procedures").notNull(), // JSON array of procedures with costs
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default('pending').notNull(), // 'pending', 'approved', 'rejected'
  validUntil: date("valid_until"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// WhatsApp Conversations - tracks chat sessions with patients
export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  patientId: varchar("patient_id").references(() => patients.id), // Optional - linked when patient is identified
  phone: text("phone").notNull(), // WhatsApp phone number
  status: text("status").default('ai').notNull(), // 'ai' | 'human' | 'closed'
  instanceName: text("instance_name"), // Evolution instance (WhatsApp number) this conversation belongs to
  assignedUserId: varchar("assigned_user_id").references(() => users.id), // Staff member who took over
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  lastMessageSender: text("last_message_sender"), // 'patient' | 'ai' | 'staff' — quem enviou a última mensagem
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("uq_wpp_conv_clinic_phone").on(t.clinicId, t.phone)]);

// WhatsApp Chat Messages - individual messages in conversations
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => whatsappConversations.id),
  sender: text("sender").notNull(), // 'patient', 'ai', 'staff'
  direction: text("direction").notNull().default('inbound'), // 'inbound' = received, 'outbound' = sent
  text: text("text").notNull(),
  extractedIntent: text("extracted_intent"), // JSON with intent data from Gemini
  externalMessageId: text("external_message_id").unique(), // Evolution API message ID (UNIQUE para idempotência)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// WhatsApp Instances - multiple phone numbers per clinic
export const whatsappInstances = pgTable("whatsapp_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  instanceName: text("instance_name").notNull(), // Evolution API instance name
  apiKey: text("api_key"),                        // Optional, falls back to global EVO_KEY
  connectedPhone: text("connected_phone"),        // Phone number when connected
  label: text("label").notNull(),                 // Friendly name e.g. "Geral", "Dr. João"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Junction: which dentists are linked to each WhatsApp instance
export const whatsappInstanceDentists = pgTable("whatsapp_instance_dentists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instanceId: varchar("instance_id").notNull().references(() => whatsappInstances.id, { onDelete: "cascade" }),
  dentistId: varchar("dentist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

// Dentist Schedules - weekly availability grid per dentist
export const dentistSchedules = pgTable(
  "dentist_schedules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    dentistId: varchar("dentist_id").notNull().references(() => users.id),
    clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
    weekday: integer("weekday").notNull(), // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    period: text("period").notNull(), // 'morning' | 'afternoon' | 'evening'
    startTime: text("start_time").notNull(), // "HH:MM"
    endTime: text("end_time").notNull(), // "HH:MM"
    isActive: boolean("is_active").default(true).notNull(),
  },
  (t) => [unique("uq_dentist_schedule").on(t.dentistId, t.weekday, t.period)],
);

// Clinic Holidays & Recesses - global blocked days for all dentists
export const clinicHolidays = pgTable("clinic_holidays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  date: text("date").notNull(), // "YYYY-MM-DD" — start date
  endDate: text("end_date"), // "YYYY-MM-DD" — end date for multi-day recessos (optional)
  name: text("name").notNull(),
  type: text("type").default("holiday").notNull(), // 'holiday' | 'recess'
  message: text("message"), // Custom WhatsApp blocking message (optional)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const clinicsRelations = relations(clinics, ({ many }) => ({
  users: many(users),
  patients: many(patients),
  appointments: many(appointments),
  anamnesisQuestions: many(anamnesisQuestions),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  clinic: one(clinics, {
    fields: [users.clinicId],
    references: [clinics.id],
  }),
  appointments: many(appointments),
  medicalRecords: many(medicalRecords),
  budgets: many(budgets),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  clinic: one(clinics, {
    fields: [patients.clinicId],
    references: [clinics.id],
  }),
  appointments: many(appointments),
  medicalRecords: many(medicalRecords),
  anamnesisResponses: many(anamnesisResponses),
  budgets: many(budgets),
  treatments: many(treatments),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  patient: one(patients, {
    fields: [appointments.patientId],
    references: [patients.id],
  }),
  dentist: one(users, {
    fields: [appointments.dentistId],
    references: [users.id],
  }),
  clinic: one(clinics, {
    fields: [appointments.clinicId],
    references: [clinics.id],
  }),
  medicalRecords: many(medicalRecords),
}));

export const medicalRecordsRelations = relations(medicalRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [medicalRecords.patientId],
    references: [patients.id],
  }),
  dentist: one(users, {
    fields: [medicalRecords.dentistId],
    references: [users.id],
  }),
  appointment: one(appointments, {
    fields: [medicalRecords.appointmentId],
    references: [appointments.id],
  }),
  clinic: one(clinics, {
    fields: [medicalRecords.clinicId],
    references: [clinics.id],
  }),
}));

export const anamnesisQuestionsRelations = relations(anamnesisQuestions, ({ one, many }) => ({
  clinic: one(clinics, {
    fields: [anamnesisQuestions.clinicId],
    references: [clinics.id],
  }),
  responses: many(anamnesisResponses),
}));

export const anamnesisResponsesRelations = relations(anamnesisResponses, ({ one }) => ({
  patient: one(patients, {
    fields: [anamnesisResponses.patientId],
    references: [patients.id],
  }),
  question: one(anamnesisQuestions, {
    fields: [anamnesisResponses.questionId],
    references: [anamnesisQuestions.id],
  }),
  treatment: one(treatments, {
    fields: [anamnesisResponses.treatmentId],
    references: [treatments.id],
  }),
  appointment: one(appointments, {
    fields: [anamnesisResponses.appointmentId],
    references: [appointments.id],
  }),
}));

export const treatmentsRelations = relations(treatments, ({ one, many }) => ({
  patient: one(patients, {
    fields: [treatments.patientId],
    references: [patients.id],
  }),
  dentist: one(users, {
    fields: [treatments.dentistId],
    references: [users.id],
  }),
  clinic: one(clinics, {
    fields: [treatments.clinicId],
    references: [clinics.id],
  }),
  budgetItems: many(budgetItems),
  budgetSummary: one(budgetSummary),
  treatmentMovements: many(treatmentMovements),
  anamnesisResponses: many(anamnesisResponses),
}));

export const budgetItemsRelations = relations(budgetItems, ({ one }) => ({
  treatment: one(treatments, {
    fields: [budgetItems.treatmentId],
    references: [treatments.id],
  }),
}));

export const budgetSummaryRelations = relations(budgetSummary, ({ one }) => ({
  treatment: one(treatments, {
    fields: [budgetSummary.treatmentId],
    references: [treatments.id],
  }),
}));

export const treatmentMovementsRelations = relations(treatmentMovements, ({ one }) => ({
  treatment: one(treatments, {
    fields: [treatmentMovements.treatmentId],
    references: [treatments.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  patient: one(patients, {
    fields: [budgets.patientId],
    references: [patients.id],
  }),
  dentist: one(users, {
    fields: [budgets.dentistId],
    references: [users.id],
  }),
  clinic: one(clinics, {
    fields: [budgets.clinicId],
    references: [clinics.id],
  }),
}));

export const whatsappInstancesRelations = relations(whatsappInstances, ({ one, many }) => ({
  clinic: one(clinics, {
    fields: [whatsappInstances.clinicId],
    references: [clinics.id],
  }),
  instanceDentists: many(whatsappInstanceDentists),
}));

export const whatsappInstanceDentistsRelations = relations(whatsappInstanceDentists, ({ one }) => ({
  instance: one(whatsappInstances, {
    fields: [whatsappInstanceDentists.instanceId],
    references: [whatsappInstances.id],
  }),
  dentist: one(users, {
    fields: [whatsappInstanceDentists.dentistId],
    references: [users.id],
  }),
}));

export const whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  clinic: one(clinics, {
    fields: [whatsappConversations.clinicId],
    references: [clinics.id],
  }),
  patient: one(patients, {
    fields: [whatsappConversations.patientId],
    references: [patients.id],
  }),
  assignedUser: one(users, {
    fields: [whatsappConversations.assignedUserId],
    references: [users.id],
  }),
  messages: many(whatsappMessages),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappMessages.conversationId],
    references: [whatsappConversations.id],
  }),
}));

// Insert schemas
export const insertClinicSchema = createInsertSchema(clinics).omit({
  id: true,
  createdAt: true,
  status: true,
  suspendedAt: true,
  suspendedBy: true,
  suspensionReason: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  tokenVersion: true,
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMedicalRecordSchema = createInsertSchema(medicalRecords).omit({
  id: true,
  createdAt: true,
});

export const insertAnamnesisQuestionSchema = createInsertSchema(anamnesisQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertAnamnesisResponseSchema = createInsertSchema(anamnesisResponses).omit({
  id: true,
  createdAt: true,
});

export const insertBudgetSchema = createInsertSchema(budgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTreatmentSchema = createInsertSchema(treatments).omit({
  id: true,
  dentistId: true,
  clinicId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetItemSchema = createInsertSchema(budgetItems).omit({
  id: true,
  createdAt: true,
});

export const insertBudgetSummarySchema = createInsertSchema(budgetSummary).omit({
  id: true,
  updatedAt: true,
});

export const insertTreatmentMovementSchema = createInsertSchema(treatmentMovements).omit({
  id: true,
  createdAt: true,
});

export const insertWhatsappInstanceSchema = createInsertSchema(whatsappInstances).omit({
  id: true,
  createdAt: true,
});

export const insertWhatsappInstanceDentistSchema = createInsertSchema(whatsappInstanceDentists).omit({
  id: true,
});

export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversations).omit({
  id: true,
  createdAt: true,
  lastMessageAt: true,
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  createdAt: true,
});

export const insertDentistScheduleSchema = createInsertSchema(dentistSchedules).omit({
  id: true,
});

export const insertClinicHolidaySchema = createInsertSchema(clinicHolidays).omit({
  id: true,
  createdAt: true,
});

// Types
export type Clinic = typeof clinics.$inferSelect;
export type InsertClinic = z.infer<typeof insertClinicSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type AccessAuditLog = typeof accessAuditLogs.$inferSelect;
export type AiUsageRecord = typeof aiUsageRecords.$inferSelect;
export type AdminJob = typeof adminJobs.$inferSelect;

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type InsertMedicalRecord = z.infer<typeof insertMedicalRecordSchema>;

export type AnamnesisQuestion = typeof anamnesisQuestions.$inferSelect;
export type InsertAnamnesisQuestion = z.infer<typeof insertAnamnesisQuestionSchema>;

export type AnamnesisResponse = typeof anamnesisResponses.$inferSelect;
export type InsertAnamnesisResponse = z.infer<typeof insertAnamnesisResponseSchema>;

export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;

export type Treatment = typeof treatments.$inferSelect;
export type InsertTreatment = z.infer<typeof insertTreatmentSchema>;

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = z.infer<typeof insertBudgetItemSchema>;

export type BudgetSummary = typeof budgetSummary.$inferSelect;
export type InsertBudgetSummary = z.infer<typeof insertBudgetSummarySchema>;

export type TreatmentMovement = typeof treatmentMovements.$inferSelect;
export type InsertTreatmentMovement = z.infer<typeof insertTreatmentMovementSchema>;

// Password reset token types
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Re-export chat models for AI integration
export * from "./models/chat";

// WhatsApp types
export type WhatsappInstance = typeof whatsappInstances.$inferSelect;
export type InsertWhatsappInstance = z.infer<typeof insertWhatsappInstanceSchema>;

export type WhatsappInstanceDentist = typeof whatsappInstanceDentists.$inferSelect;
export type InsertWhatsappInstanceDentist = z.infer<typeof insertWhatsappInstanceDentistSchema>;

export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;

// Availability types
export type DentistSchedule = typeof dentistSchedules.$inferSelect;
export type InsertDentistSchedule = z.infer<typeof insertDentistScheduleSchema>;

export type ClinicHoliday = typeof clinicHolidays.$inferSelect;
export type InsertClinicHoliday = z.infer<typeof insertClinicHolidaySchema>;
