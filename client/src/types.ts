// Re-export all types from shared schema
export type {
  Clinic,
  InsertClinic,
  User,
  InsertUser,
  Patient,
  InsertPatient,
  Appointment,
  InsertAppointment,
  MedicalRecord,
  InsertMedicalRecord,
  AnamnesisQuestion,
  InsertAnamnesisQuestion,
  AnamnesisResponse,
  InsertAnamnesisResponse,
  Budget,
  InsertBudget,
  Treatment,
  InsertTreatment,
  BudgetItem,
  InsertBudgetItem,
  BudgetSummary,
  InsertBudgetSummary,
  TreatmentMovement,
  InsertTreatmentMovement,
} from "@/../../shared/schema";

// Import specific types for internal use
import type { User } from "@/../../shared/schema";

// Auth types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}