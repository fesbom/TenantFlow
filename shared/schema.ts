import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, date, decimal } from "drizzle-orm/pg-core";
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
  logoUrl: text("logo_url"), // URL for clinic logo
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Users table with clinic association and roles
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(), // 'admin', 'dentist', 'secretary'
  clinicId: varchar("clinic_id").notNull().references(() => clinics.id),
  externalId: text("external_id").unique(), // ID from legacy system for import deduplication
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

// Insert schemas
export const insertClinicSchema = createInsertSchema(clinics).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
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

// Types
export type Clinic = typeof clinics.$inferSelect;
export type InsertClinic = z.infer<typeof insertClinicSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

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
