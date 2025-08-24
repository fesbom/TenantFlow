import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Appointment, Patient, User } from "@/types";

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
}

interface AppointmentFormData {
  patientId: string;
  dentistId: string;
  scheduledDate: string;
  duration: number;
  procedure: string;
  notes: string;
}

export default function AppointmentModal({ isOpen, onClose, appointment }: AppointmentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<AppointmentFormData>({
    patientId: "",
    dentistId: "",
    scheduledDate: "",
    duration: 60,
    procedure: "",
    notes: "",
  });

  // Fetch patients and dentists
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const dentists = users.filter(user => user.role === "dentist");

  useEffect(() => {
    if (appointment) {
      setFormData({
        patientId: appointment.patientId,
        dentistId: appointment.dentistId,
        scheduledDate: new Date(appointment.scheduledDate).toISOString().slice(0, 16),
        duration: appointment.duration || 60,
        procedure: appointment.procedure || "",
        notes: appointment.notes || "",
      });
    } else {
      setFormData({
        patientId: "",
        dentistId: "",
        scheduledDate: "",
        duration: 60,
        procedure: "",
        notes: "",
      });
    }
  }, [appointment]);

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentFormData) => {
      const response = await apiRequest("POST", "/api/appointments", {
        ...data,
        scheduledDate: new Date(data.scheduledDate).toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/today-appointments"] });
      toast({
        title: "Agendamento criado",
        description: "Agendamento criado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao criar agendamento",
        description: "Não foi possível criar o agendamento",
        variant: "destructive",
      });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentFormData) => {
      const response = await apiRequest("PUT", `/api/appointments/${appointment!.id}`, {
        ...data,
        scheduledDate: new Date(data.scheduledDate).toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/today-appointments"] });
      toast({
        title: "Agendamento atualizado",
        description: "Agendamento atualizado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar agendamento",
        description: "Não foi possível atualizar o agendamento",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (appointment) {
      updateAppointmentMutation.mutate(formData);
    } else {
      createAppointmentMutation.mutate(formData);
    }
  };

  const handleInputChange = (field: keyof AppointmentFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {appointment ? "Editar Agendamento" : "Novo Agendamento"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patientId">Paciente *</Label>
              <Select
                value={formData.patientId}
                onValueChange={(value) => handleInputChange("patientId", value)}
                required
              >
                <SelectTrigger data-testid="select-appointment-patient">
                  <SelectValue placeholder="Selecione um paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dentistId">Dentista *</Label>
              <Select
                value={formData.dentistId}
                onValueChange={(value) => handleInputChange("dentistId", value)}
                required
              >
                <SelectTrigger data-testid="select-appointment-dentist">
                  <SelectValue placeholder="Selecione um dentista" />
                </SelectTrigger>
                <SelectContent>
                  {dentists.map((dentist) => (
                    <SelectItem key={dentist.id} value={dentist.id}>
                      {dentist.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Data e Hora *</Label>
              <Input
                id="scheduledDate"
                type="datetime-local"
                value={formData.scheduledDate}
                onChange={(e) => handleInputChange("scheduledDate", e.target.value)}
                required
                data-testid="input-appointment-datetime"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duração (minutos)</Label>
              <Input
                id="duration"
                type="number"
                min="15"
                max="480"
                step="15"
                value={formData.duration}
                onChange={(e) => handleInputChange("duration", parseInt(e.target.value))}
                data-testid="input-appointment-duration"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="procedure">Procedimento</Label>
              <Input
                id="procedure"
                value={formData.procedure}
                onChange={(e) => handleInputChange("procedure", e.target.value)}
                placeholder="Ex: Consulta de rotina, Limpeza dental..."
                data-testid="input-appointment-procedure"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                placeholder="Observações adicionais sobre o agendamento"
                rows={3}
                data-testid="textarea-appointment-notes"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-appointment"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createAppointmentMutation.isPending || updateAppointmentMutation.isPending}
              data-testid="button-save-appointment"
            >
              {createAppointmentMutation.isPending || updateAppointmentMutation.isPending
                ? "Salvando..."
                : appointment
                ? "Atualizar"
                : "Criar Agendamento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
