import {
  clinics,
  users,
  patients,
  appointments,
  medicalRecords,
  anamnesisQuestions,
  anamnesisResponses,
  budgets,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, count } from "drizzle-orm";

export interface IStorage {
  // Clinic methods
  createClinic(clinic: InsertClinic): Promise<Clinic>;
  getClinicById(id: string): Promise<Clinic | undefined>;

  // User methods
  createUser(user: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByClinic(clinicId: string): Promise<User[]>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;

  // Patient methods
  createPatient(patient: InsertPatient): Promise<Patient>;
  getPatientsByClinic(clinicId: string): Promise<Patient[]>;
  getPatientById(id: string, clinicId: string): Promise<Patient | undefined>;
  updatePatient(id: string, updates: Partial<InsertPatient>, clinicId: string): Promise<Patient | undefined>;
  deletePatient(id: string, clinicId: string): Promise<boolean>;
  getBirthdayPatients(clinicId: string, date: Date): Promise<Patient[]>;

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

  // Budget methods
  createBudget(budget: InsertBudget): Promise<Budget>;
  getBudgetsByClinic(clinicId: string): Promise<Budget[]>;
  getBudgetById(id: string, clinicId: string): Promise<Budget | undefined>;
  updateBudget(id: string, updates: Partial<InsertBudget>, clinicId: string): Promise<Budget | undefined>;
  deleteBudget(id: string, clinicId: string): Promise<boolean>;

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
    return (result.rowCount || 0) > 0;
  }

  async getBirthdayPatients(clinicId: string, date: Date): Promise<Patient[]> {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    return await db
      .select()
      .from(patients)
      .where(and(
        eq(patients.clinicId, clinicId),
        // SQL to match month and day
      ));
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
}

export const storage = new DatabaseStorage();
