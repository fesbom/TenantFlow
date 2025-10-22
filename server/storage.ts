import {
  clinics,
  users,
  patients,
  appointments,
  medicalRecords,
  anamnesisQuestions,
  anamnesisResponses,
  budgets,
  passwordResetTokens,
  treatments,
  budgetItems,
  budgetSummary,
  treatmentMovements,
  type Clinic,
  type User,
  type Patient,
  type Appointment,
  type MedicalRecord,
  type AnamnesisQuestion,
  type AnamnesisResponse,
  type Budget,
  type InsertClinic,
  type InsertUser,
  type InsertPatient,
  type InsertAppointment,
  type InsertMedicalRecord,
  type InsertAnamnesisQuestion,
  type InsertAnamnesisResponse,
  type InsertBudget,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type Treatment,
  type InsertTreatment,
  type BudgetItem,
  type InsertBudgetItem,
  type BudgetSummary,
  type InsertBudgetSummary,
  type TreatmentMovement,
  type InsertTreatmentMovement,
} from "@shared/schema";

import { db } from "./db";
import { eq, and, desc, gte, lte, count, sql, isNotNull } from "drizzle-orm";

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface IStorage {
  // Clinic methods
  createClinic(clinic: InsertClinic): Promise<Clinic>;
  getClinicById(id: string): Promise<Clinic | undefined>;
  updateClinic(id: string, updates: Partial<InsertClinic>): Promise<Clinic | undefined>;

  // User methods
  createUser(user: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByClinic(clinicId: string): Promise<User[]>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined>;

  // Password reset token methods
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markTokenAsUsed(token: string): Promise<boolean>;
  deleteExpiredTokens(): Promise<void>;

  // Patient methods
  createPatient(patient: InsertPatient): Promise<Patient>;
  getPatientsByClinic(clinicId: string): Promise<Patient[]>;
  getPatientById(id: string, clinicId: string): Promise<Patient | undefined>;
  getPatientByExternalId(externalId: string, clinicId: string): Promise<Patient | undefined>;
  updatePatient(id: string, updates: Partial<InsertPatient>, clinicId: string): Promise<Patient | undefined>;
  deletePatient(id: string, clinicId: string): Promise<boolean>;
  getBirthdayPatients(clinicId: string, pagination: { page: number; pageSize: number }): Promise<PaginatedResponse<Patient>>;

  // Appointment methods
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  getAppointmentsByClinic(clinicId: string): Promise<Appointment[]>;
  getAppointmentsByDate(clinicId: string, date: Date): Promise<Appointment[]>;
  getAppointmentById(id: string, clinicId: string): Promise<Appointment | undefined>;
  updateAppointment(id: string, updates: Partial<InsertAppointment>, clinicId: string): Promise<Appointment | undefined>;
  deleteAppointment(id: string, clinicId: string): Promise<boolean>;

  // Medical record methods
  createMedicalRecord(record: InsertMedicalRecord): Promise<MedicalRecord>;
  getMedicalRecordsByPatient(patientId: string, clinicId: string): Promise<MedicalRecord[]>;
  getMedicalRecordById(id: string, clinicId: string): Promise<MedicalRecord | undefined>;
  updateMedicalRecord(id: string, updates: Partial<InsertMedicalRecord>, clinicId: string): Promise<MedicalRecord | undefined>;

  // Anamnesis methods
  createAnamnesisQuestion(question: InsertAnamnesisQuestion): Promise<AnamnesisQuestion>;
  getAnamnesisQuestionsByClinic(clinicId: string): Promise<AnamnesisQuestion[]>;
  updateAnamnesisQuestion(id: string, updates: Partial<InsertAnamnesisQuestion>, clinicId: string): Promise<AnamnesisQuestion | undefined>;
  deleteAnamnesisQuestion(id: string, clinicId: string): Promise<boolean>;

  createAnamnesisResponse(response: InsertAnamnesisResponse): Promise<AnamnesisResponse>;
  getAnamnesisResponsesByPatient(patientId: string): Promise<AnamnesisResponse[]>;
  deleteAnamnesisResponsesByTreatment(treatmentId: string): Promise<boolean>;
  getAnamnesisWithResponsesByTreatment(treatmentId: string, clinicId: string): Promise<Array<{
    questionId: string;
    question: string;
    response?: string;
    createdAt?: string;
  }>>;

  // Budget methods
  createBudget(budget: InsertBudget): Promise<Budget>;
  getBudgetsByClinic(clinicId: string): Promise<Budget[]>;
  getBudgetById(id: string, clinicId: string): Promise<Budget | undefined>;
  updateBudget(id: string, updates: Partial<InsertBudget>, clinicId: string): Promise<Budget | undefined>;
  deleteBudget(id: string, clinicId: string): Promise<boolean>;

  // Treatment methods
  createTreatment(treatment: InsertTreatment & { clinicId: string; dentistId: string }): Promise<Treatment>;
  getTreatmentsByPatient(patientId: string, clinicId: string): Promise<Treatment[]>;
  getTreatmentById(id: string, clinicId: string): Promise<Treatment | undefined>;
  updateTreatment(id: string, updates: Partial<InsertTreatment>, clinicId: string): Promise<Treatment | undefined>;
  deleteTreatment(id: string, clinicId: string): Promise<boolean>;

  // Budget Item methods
  createBudgetItem(budgetItem: InsertBudgetItem): Promise<BudgetItem>;
  getBudgetItemsByTreatment(treatmentId: string): Promise<BudgetItem[]>;
  updateBudgetItem(id: string, updates: Partial<InsertBudgetItem>): Promise<BudgetItem | undefined>;
  deleteBudgetItem(id: string): Promise<boolean>;

  // Budget Summary methods
  createOrUpdateBudgetSummary(budgetSummary: InsertBudgetSummary): Promise<BudgetSummary>;
  getBudgetSummaryByTreatment(treatmentId: string): Promise<BudgetSummary | undefined>;

  // Treatment Movement methods
  createTreatmentMovement(movement: InsertTreatmentMovement): Promise<TreatmentMovement>;
  getTreatmentMovementsByTreatment(treatmentId: string): Promise<TreatmentMovement[]>;
  updateTreatmentMovement(id: string, updates: Partial<InsertTreatmentMovement>): Promise<TreatmentMovement | undefined>;
  deleteTreatmentMovement(id: string): Promise<boolean>;

  // Anamnesis responses for treatments
  getAnamnesisResponsesByTreatment(treatmentId: string): Promise<AnamnesisResponse[]>;
  createOrUpdateAnamnesisResponse(response: InsertAnamnesisResponse): Promise<AnamnesisResponse>;

  // Dashboard stats
  getDashboardStats(clinicId: string): Promise<{
    activePatients: number;
    todayAppointments: number;
    monthlyRevenue: number;
    attendanceRate: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Clinic methods
  async createClinic(insertClinic: InsertClinic): Promise<Clinic> {
    const [clinic] = await db.insert(clinics).values(insertClinic).returning();
    return clinic;
  }

  async getClinicById(id: string): Promise<Clinic | undefined> {
    const [clinic] = await db.select().from(clinics).where(eq(clinics.id, id));
    return clinic || undefined;
  }

  async updateClinic(id: string, updates: Partial<InsertClinic>): Promise<Clinic | undefined> {
    const [clinic] = await db
      .update(clinics)
      .set(updates)
      .where(eq(clinics.id, id))
      .returning();
    return clinic || undefined;
  }

  // User methods
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUsersByClinic(clinicId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.clinicId, clinicId));
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  // Patient methods
  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const [patient] = await db.insert(patients).values(insertPatient).returning();
    return patient;
  }

  async getPatientsByClinic(clinicId: string): Promise<Patient[]> {
    return await db
      .select()
      .from(patients)
      .where(eq(patients.clinicId, clinicId))
      .orderBy(desc(patients.createdAt));
  }

  async getPatientById(id: string, clinicId: string): Promise<Patient | undefined> {
    const [patient] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.id, id), eq(patients.clinicId, clinicId)));
    return patient || undefined;
  }

  async getPatientByExternalId(externalId: string, clinicId: string): Promise<Patient | undefined> {
    const [patient] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.externalId, externalId), eq(patients.clinicId, clinicId)));
    return patient || undefined;
  }

  async updatePatient(id: string, updates: Partial<InsertPatient>, clinicId: string): Promise<Patient | undefined> {
    const [patient] = await db
      .update(patients)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(patients.id, id), eq(patients.clinicId, clinicId)))
      .returning();
    return patient || undefined;
  }

  async deletePatient(id: string, clinicId: string): Promise<boolean> {
    const result = await db
      .delete(patients)
      .where(and(eq(patients.id, id), eq(patients.clinicId, clinicId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getBirthdayPatients(clinicId: string, pagination: { page: number; pageSize: number }): Promise<PaginatedResponse<Patient>> {
    try {
      const { page, pageSize } = pagination;
      const offset = (page - 1) * pageSize;

      const whereCondition = and(
        eq(patients.clinicId, clinicId),
        isNotNull(patients.birthDate),
        // A lógica de fuso horário é feita 100% no banco de dados
        sql`EXTRACT(MONTH FROM "birth_date") = EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/Sao_Paulo')`,
        sql`EXTRACT(DAY FROM "birth_date") = EXTRACT(DAY FROM NOW() AT TIME ZONE 'America/Sao_Paulo')`
      );

      // 1. Obter a contagem total de aniversariantes para a paginação
      const [{ count: totalCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(patients)
        .where(whereCondition);

      const totalPages = Math.ceil(totalCount / pageSize);

      // 2. Obter os aniversariantes da página atual
      const birthdayPatients = await db
        .select()
        .from(patients)
        .where(whereCondition)
        .orderBy(patients.fullName)
        .limit(pageSize)
        .offset(offset);

      // 3. Retornar no formato paginado esperado pelo frontend
      return {
        data: birthdayPatients,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
        },
      };

    } catch (error) {
      console.error("Erro ao buscar aniversariantes:", error);
      // Retorna um objeto vazio e paginado em caso de erro
      return { data: [], pagination: { page: 1, pageSize: 0, totalCount: 0, totalPages: 1 } };
    }
  }

  // Appointment methods
  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db.insert(appointments).values(insertAppointment).returning();
    return appointment;
  }

  async getAppointmentsByClinic(clinicId: string): Promise<Appointment[]> {
    return await db
      .select()
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId))
      .orderBy(desc(appointments.scheduledDate));
  }

  async getAppointmentsByDate(clinicId: string, date: Date): Promise<Appointment[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.clinicId, clinicId),
        gte(appointments.scheduledDate, startOfDay),
        lte(appointments.scheduledDate, endOfDay)
      ))
      .orderBy(appointments.scheduledDate);
  }

  async getAppointmentById(id: string, clinicId: string): Promise<Appointment | undefined> {
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, id), eq(appointments.clinicId, clinicId)));
    return appointment || undefined;
  }

  async updateAppointment(id: string, updates: Partial<InsertAppointment>, clinicId: string): Promise<Appointment | undefined> {
    const [appointment] = await db
      .update(appointments)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(appointments.id, id), eq(appointments.clinicId, clinicId)))
      .returning();
    return appointment || undefined;
  }

  async deleteAppointment(id: string, clinicId: string): Promise<boolean> {
    const result = await db
      .delete(appointments)
      .where(and(eq(appointments.id, id), eq(appointments.clinicId, clinicId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Medical record methods
  async createMedicalRecord(insertRecord: InsertMedicalRecord): Promise<MedicalRecord> {
    const [record] = await db.insert(medicalRecords).values(insertRecord).returning();
    return record;
  }

  async getMedicalRecordsByPatient(patientId: string, clinicId: string): Promise<MedicalRecord[]> {
    return await db
      .select()
      .from(medicalRecords)
      .where(and(eq(medicalRecords.patientId, patientId), eq(medicalRecords.clinicId, clinicId)))
      .orderBy(desc(medicalRecords.createdAt));
  }

  async getMedicalRecordById(id: string, clinicId: string): Promise<MedicalRecord | undefined> {
    const [record] = await db
      .select()
      .from(medicalRecords)
      .where(and(eq(medicalRecords.id, id), eq(medicalRecords.clinicId, clinicId)));
    return record || undefined;
  }

  async updateMedicalRecord(id: string, updates: Partial<InsertMedicalRecord>, clinicId: string): Promise<MedicalRecord | undefined> {
    const [record] = await db
      .update(medicalRecords)
      .set(updates)
      .where(and(eq(medicalRecords.id, id), eq(medicalRecords.clinicId, clinicId)))
      .returning();
    return record || undefined;
  }

  // Anamnesis methods
  async createAnamnesisQuestion(insertQuestion: InsertAnamnesisQuestion): Promise<AnamnesisQuestion> {
    const [question] = await db.insert(anamnesisQuestions).values(insertQuestion).returning();
    return question;
  }

  async getAnamnesisQuestionsByClinic(clinicId: string): Promise<AnamnesisQuestion[]> {
    return await db
      .select()
      .from(anamnesisQuestions)
      .where(eq(anamnesisQuestions.clinicId, clinicId))
      .orderBy(anamnesisQuestions.createdAt);
  }

  async updateAnamnesisQuestion(id: string, updates: Partial<InsertAnamnesisQuestion>, clinicId: string): Promise<AnamnesisQuestion | undefined> {
    const [question] = await db
      .update(anamnesisQuestions)
      .set(updates)
      .where(and(eq(anamnesisQuestions.id, id), eq(anamnesisQuestions.clinicId, clinicId)))
      .returning();
    return question || undefined;
  }

  async deleteAnamnesisQuestion(id: string, clinicId: string): Promise<boolean> {
    const result = await db
      .delete(anamnesisQuestions)
      .where(and(eq(anamnesisQuestions.id, id), eq(anamnesisQuestions.clinicId, clinicId)));
    return (result.rowCount ?? 0) > 0;
  }

  async createAnamnesisResponse(insertResponse: InsertAnamnesisResponse): Promise<AnamnesisResponse> {
    const [response] = await db.insert(anamnesisResponses).values(insertResponse).returning();
    return response;
  }

  async getAnamnesisResponsesByPatient(patientId: string): Promise<AnamnesisResponse[]> {
    return await db
      .select()
      .from(anamnesisResponses)
      .where(eq(anamnesisResponses.patientId, patientId))
      .orderBy(desc(anamnesisResponses.createdAt));
  }

  async deleteAnamnesisResponsesByTreatment(treatmentId: string): Promise<boolean> {
    const result = await db
      .delete(anamnesisResponses)
      .where(eq(anamnesisResponses.treatmentId, treatmentId));
    return (result.rowCount ?? 0) > 0;
  }

  async getAnamnesisWithResponsesByTreatment(treatmentId: string, clinicId: string): Promise<Array<{
    questionId: string;
    question: string;
    response?: string;
    createdAt?: string;
  }>> {
    const result = await db
      .select({
        questionId: anamnesisQuestions.id,
        question: anamnesisQuestions.question,
        response: anamnesisResponses.response,
        createdAt: anamnesisResponses.createdAt,
      })
      .from(anamnesisQuestions)
      .leftJoin(anamnesisResponses, and(
        eq(anamnesisQuestions.id, anamnesisResponses.questionId),
        eq(anamnesisResponses.treatmentId, treatmentId)
      ))
      .where(eq(anamnesisQuestions.clinicId, clinicId))
      .orderBy(anamnesisQuestions.createdAt);

    return result.map(row => ({
      questionId: row.questionId,
      question: row.question,
      response: row.response || undefined,
      createdAt: row.createdAt?.toISOString() || undefined,
    }));
  }

  // Budget methods
  async createBudget(insertBudget: InsertBudget): Promise<Budget> {
    const [budget] = await db.insert(budgets).values(insertBudget).returning();
    return budget;
  }

  async getBudgetsByClinic(clinicId: string): Promise<Budget[]> {
    return await db
      .select()
      .from(budgets)
      .where(eq(budgets.clinicId, clinicId))
      .orderBy(desc(budgets.createdAt));
  }

  async getBudgetById(id: string, clinicId: string): Promise<Budget | undefined> {
    const [budget] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.clinicId, clinicId)));
    return budget || undefined;
  }

  async updateBudget(id: string, updates: Partial<InsertBudget>, clinicId: string): Promise<Budget | undefined> {
    const [budget] = await db
      .update(budgets)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(budgets.id, id), eq(budgets.clinicId, clinicId)))
      .returning();
    return budget || undefined;
  }

  async deleteBudget(id: string, clinicId: string): Promise<boolean> {
    const result = await db
      .delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.clinicId, clinicId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Dashboard stats
  async getDashboardStats(clinicId: string): Promise<{
    activePatients: number;
    todayAppointments: number;
    monthlyRevenue: number;
    attendanceRate: number;
  }> {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Count active patients
    const [{ count: activePatients }] = await db
      .select({ count: count() })
      .from(patients)
      .where(eq(patients.clinicId, clinicId));

    // Count today's appointments
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [{ count: todayAppointments }] = await db
      .select({ count: count() })
      .from(appointments)
      .where(and(
        eq(appointments.clinicId, clinicId),
        gte(appointments.scheduledDate, startOfDay),
        lte(appointments.scheduledDate, endOfDay)
      ));

    // Calculate monthly revenue from completed appointments with medical records
    const revenueRecords = await db
      .select()
      .from(medicalRecords)
      .where(and(
        eq(medicalRecords.clinicId, clinicId),
        gte(medicalRecords.createdAt, startOfMonth),
        lte(medicalRecords.createdAt, endOfMonth)
      ));

    const monthlyRevenue = revenueRecords.reduce((sum, record) => {
      return sum + (record.cost ? parseFloat(record.cost) : 0);
    }, 0);

    // Calculate attendance rate (simplified)
    const completedAppointments = await db
      .select({ count: count() })
      .from(appointments)
      .where(and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.status, 'completed'),
        gte(appointments.scheduledDate, startOfMonth),
        lte(appointments.scheduledDate, endOfMonth)
      ));

    const totalAppointments = await db
      .select({ count: count() })
      .from(appointments)
      .where(and(
        eq(appointments.clinicId, clinicId),
        gte(appointments.scheduledDate, startOfMonth),
        lte(appointments.scheduledDate, endOfMonth)
      ));

    const attendanceRate = totalAppointments[0].count > 0 
      ? (completedAppointments[0].count / totalAppointments[0].count) * 100 
      : 0;

    return {
      activePatients,
      todayAppointments,
      monthlyRevenue,
      attendanceRate: Math.round(attendanceRate),
    };
  }

  // Treatment methods
  async createTreatment(insertTreatment: InsertTreatment & { clinicId: string; dentistId: string }): Promise<Treatment> {
    const [treatment] = await db.insert(treatments).values([insertTreatment]).returning();
    return treatment;
  }

  async getTreatmentsByPatient(patientId: string, clinicId: string): Promise<Treatment[]> {
    return await db
      .select()
      .from(treatments)
      .where(and(eq(treatments.patientId, patientId), eq(treatments.clinicId, clinicId)))
      .orderBy(desc(treatments.createdAt));
  }

  async getTreatmentById(id: string, clinicId: string): Promise<Treatment | undefined> {
    const [treatment] = await db
      .select()
      .from(treatments)
      .where(and(eq(treatments.id, id), eq(treatments.clinicId, clinicId)));
    return treatment || undefined;
  }

  async updateTreatment(id: string, updates: Partial<InsertTreatment>, clinicId: string): Promise<Treatment | undefined> {
    const [treatment] = await db
      .update(treatments)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(treatments.id, id), eq(treatments.clinicId, clinicId)))
      .returning();
    return treatment || undefined;
  }

  async deleteTreatment(id: string, clinicId: string): Promise<boolean> {
    const result = await db
      .delete(treatments)
      .where(and(eq(treatments.id, id), eq(treatments.clinicId, clinicId)));
    return (result.rowCount || 0) > 0;
  }

  // Budget Item methods
  async createBudgetItem(insertBudgetItem: InsertBudgetItem): Promise<BudgetItem> {
    const [budgetItem] = await db.insert(budgetItems).values(insertBudgetItem).returning();
    return budgetItem;
  }

  async getBudgetItemsByTreatment(treatmentId: string): Promise<BudgetItem[]> {
    return await db
      .select()
      .from(budgetItems)
      .where(eq(budgetItems.treatmentId, treatmentId))
      .orderBy(budgetItems.createdAt);
  }

  async updateBudgetItem(id: string, updates: Partial<InsertBudgetItem>): Promise<BudgetItem | undefined> {
    const [budgetItem] = await db
      .update(budgetItems)
      .set(updates)
      .where(eq(budgetItems.id, id))
      .returning();
    return budgetItem || undefined;
  }

  async deleteBudgetItem(id: string): Promise<boolean> {
    const result = await db
      .delete(budgetItems)
      .where(eq(budgetItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Budget Summary methods
  async createOrUpdateBudgetSummary(insertBudgetSummary: InsertBudgetSummary): Promise<BudgetSummary> {
    // Check if summary already exists
    const [existing] = await db
      .select()
      .from(budgetSummary)
      .where(eq(budgetSummary.treatmentId, insertBudgetSummary.treatmentId));

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(budgetSummary)
        .set({ ...insertBudgetSummary, updatedAt: new Date() })
        .where(eq(budgetSummary.treatmentId, insertBudgetSummary.treatmentId))
        .returning();
      return updated;
    } else {
      // Create new
      const [created] = await db.insert(budgetSummary).values(insertBudgetSummary).returning();
      return created;
    }
  }

  async getBudgetSummaryByTreatment(treatmentId: string): Promise<BudgetSummary | undefined> {
    const [summary] = await db
      .select()
      .from(budgetSummary)
      .where(eq(budgetSummary.treatmentId, treatmentId));
    return summary || undefined;
  }

  // Treatment Movement methods
  async createTreatmentMovement(insertMovement: InsertTreatmentMovement): Promise<TreatmentMovement> {
    const [movement] = await db.insert(treatmentMovements).values(insertMovement).returning();

    // Update patient's last visit date automatically
    try {
      // Get the treatment to find the patient
      const [treatment] = await db
        .select({ patientId: treatments.patientId })
        .from(treatments)
        .where(eq(treatments.id, insertMovement.treatmentId));

      if (treatment) {
        // Update patient's last visit date to today
        await db
          .update(patients)
          .set({ lastVisitDate: new Date().toISOString().split('T')[0] }) // YYYY-MM-DD format
          .where(eq(patients.id, treatment.patientId));
      }
    } catch (error) {
      console.error('Error updating patient last visit date:', error);
      // Don't throw - the movement was created successfully
    }

    return movement;
  }

  async getTreatmentMovementsByTreatment(treatmentId: string): Promise<TreatmentMovement[]> {
    return await db
      .select()
      .from(treatmentMovements)
      .where(eq(treatmentMovements.treatmentId, treatmentId))
      .orderBy(desc(treatmentMovements.dataMovimentacao));
  }

  async updateTreatmentMovement(id: string, updates: Partial<InsertTreatmentMovement>): Promise<TreatmentMovement | undefined> {
    const [movement] = await db
      .update(treatmentMovements)
      .set(updates)
      .where(eq(treatmentMovements.id, id))
      .returning();
    return movement || undefined;
  }

  async deleteTreatmentMovement(id: string): Promise<boolean> {
    const result = await db
      .delete(treatmentMovements)
      .where(eq(treatmentMovements.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Anamnesis responses for treatments
  async getAnamnesisResponsesByTreatment(treatmentId: string): Promise<AnamnesisResponse[]> {
    return await db
      .select()
      .from(anamnesisResponses)
      .where(eq(anamnesisResponses.treatmentId, treatmentId))
      .orderBy(anamnesisResponses.createdAt);
  }

  async createOrUpdateAnamnesisResponse(insertResponse: InsertAnamnesisResponse): Promise<AnamnesisResponse> {
    // Check if response already exists for this question and treatment
    const [existing] = await db
      .select()
      .from(anamnesisResponses)
      .where(
        and(
          eq(anamnesisResponses.questionId, insertResponse.questionId),
          eq(anamnesisResponses.treatmentId, insertResponse.treatmentId!)
        )
      );

    if (existing) {
      // Update existing response
      const [updated] = await db
        .update(anamnesisResponses)
        .set({ response: insertResponse.response })
        .where(eq(anamnesisResponses.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new response
      const [created] = await db.insert(anamnesisResponses).values(insertResponse).returning();
      return created;
    }
  }

  // Password reset token methods
  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db.insert(passwordResetTokens).values(tokenData).returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.isUsed, false),
        gte(passwordResetTokens.expiresAt, new Date())
      ));
    return resetToken || undefined;
  }

  async markTokenAsUsed(token: string): Promise<boolean> {
    const result = await db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(eq(passwordResetTokens.token, token));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteExpiredTokens(): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(lte(passwordResetTokens.expiresAt, new Date()));
  }
}

export const storage = new DatabaseStorage();
