export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'dentist' | 'secretary';
  clinicId: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface Patient {
  id: string;
  fullName: string;
  cpf?: string;
  email?: string;
  phone: string;
  birthDate?: string;
  address?: string;
  medicalNotes?: string;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  dentistId: string;
  clinicId: string;
  scheduledDate: string;
  duration?: number;
  procedure?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  dentistId: string;
  appointmentId?: string;
  clinicId: string;
  procedure: string;
  clinicalNotes?: string;
  treatmentPlan?: string;
  images?: string;
  cost?: string;
  createdAt: string;
}

export interface Treatment {
  id: string;
  patientId: string;
  dentistId: string;
  clinicId: string;
  dataInicio: string;
  situacaoTratamento: 'Em andamento' | 'Concluído' | 'Cancelado';
  tituloTratamento: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetItem {
  id: string;
  treatmentId: string;
  descricaoOrcamento: string;
  valorOrcamento: string;
  createdAt: string;
}

export interface BudgetSummary {
  id: string;
  treatmentId: string;
  subtotalOrcamento: string;
  descontoOrcamento: string;
  totalOrcamento: string;
  condicaoPagamento?: string;
  updatedAt: string;
}

export interface TreatmentMovement {
  id: string;
  treatmentId: string;
  dataMovimentacao: string;
  descricaoAtividade: string;
  valorServico: string;
  fotoAtividade?: string;
  createdAt: string;
}

export interface AnamnesisQuestion {
  id: string;
  question: string;
  type: 'text' | 'boolean' | 'multiple_choice';
  options?: string;
  isRequired: boolean;
  clinicId: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  patientId: string;
  dentistId: string;
  clinicId: string;
  title: string;
  procedures: string;
  totalCost: string;
  status: 'pending' | 'approved' | 'rejected';
  validUntil?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  activePatients: number;
  todayAppointments: number;
  monthlyRevenue: number;
  attendanceRate: number;
}
