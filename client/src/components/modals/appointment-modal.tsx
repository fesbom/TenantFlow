import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient"; // Supondo que você ainda use isso para mutações
import { Appointment, Patient, User } from "@/types";
import { Search, Loader2 } from "lucide-react";

// Função de busca genérica
const fetchData = async (url: string) => {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
    });
    if (!response.ok) throw new Error('A resposta da rede não foi bem-sucedida');
    return response.json();
};

interface PaginatedPatientsResponse {
    data: Patient[];
}

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  initialDateTime?: Date;
  onDelete?: (appointment: Appointment) => void;
  dentists: User[];
}

interface AppointmentFormData {
  patientId: string;
  dentistId: string;
  scheduledDate: string;
  duration: number;
  procedure: string;
  notes: string;
}

export default function AppointmentModal({ 
    isOpen, 
    onClose, 
    appointment, 
    initialDateTime, 
    onDelete,
    dentists
}: AppointmentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  const [formData, setFormData] = useState<AppointmentFormData>({
    patientId: "", dentistId: "", scheduledDate: "", duration: 60, procedure: "", notes: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(patientSearchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [patientSearchTerm]);

  const { data: patientsResponse, isLoading: patientsLoading } = useQuery<PaginatedPatientsResponse>({
      queryKey: ['/api/patients', { search: debouncedSearchTerm, pageSize: 20 }],
      queryFn: ({ queryKey }) => {
          const [_key, params] = queryKey as [string, { search: string, pageSize: number }];
          const searchParams = new URLSearchParams({ pageSize: params.pageSize.toString() });
          if (params.search) {
              searchParams.append('search', params.search);
          }
          return fetchData(`${_key}?${searchParams.toString()}`);
      },
      enabled: isOpen,
  });
  
  // Fetch the current patient when editing (to display in the select)
  const { data: currentPatientResponse } = useQuery<Patient>({
      queryKey: ['/api/patients', appointment?.patientId],
      queryFn: () => fetchData(`/api/patients/${appointment?.patientId}`),
      enabled: isOpen && !!appointment?.patientId,
  });
  
  // Combine current patient with search results, avoiding duplicates
  const foundPatients = (() => {
      const searchResults = patientsResponse?.data || [];
      if (currentPatientResponse && !searchResults.find(p => p.id === currentPatientResponse.id)) {
          return [currentPatientResponse, ...searchResults];
      }
      return searchResults;
  })();

  useEffect(() => {
    if (isOpen) {
        if (appointment) {
            // Fix timezone: treat UTC time as local time (no conversion)
            const dataDoBanco = new Date(appointment.scheduledDate);
            const dataCorretaParaExibicao = new Date(
              dataDoBanco.getUTCFullYear(),
              dataDoBanco.getUTCMonth(),
              dataDoBanco.getUTCDate(),
              dataDoBanco.getUTCHours(),
              dataDoBanco.getUTCMinutes()
            );
            const formattedDateTime = `${dataCorretaParaExibicao.getFullYear()}-${String(dataCorretaParaExibicao.getMonth() + 1).padStart(2, '0')}-${String(dataCorretaParaExibicao.getDate()).padStart(2, '0')}T${String(dataCorretaParaExibicao.getHours()).padStart(2, '0')}:${String(dataCorretaParaExibicao.getMinutes()).padStart(2, '0')}`;
            setFormData({
                patientId: appointment.patientId, dentistId: appointment.dentistId, scheduledDate: formattedDateTime,
                duration: appointment.duration || 60, procedure: appointment.procedure || "", notes: appointment.notes || "",
            });
        } else {
            let formattedDateTime = "";
            if (initialDateTime) {
                const d = initialDateTime;
                formattedDateTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            }
            setFormData({
                patientId: "", dentistId: "", scheduledDate: formattedDateTime, duration: 60, procedure: "", notes: "",
            });
        }
        setPatientSearchTerm("");
        setDebouncedSearchTerm("");
    }
  }, [appointment, initialDateTime, isOpen]);

  const mutationOptions = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/today-appointments"] });
      onClose();
    },
    onError: () => {
      const isUpdate = !!appointment;
      toast({
        title: `Erro ao ${isUpdate ? 'atualizar' : 'criar'} agendamento`,
        variant: "destructive",
      });
    },
  };

  const createAppointmentMutation = useMutation({
    mutationFn: (data: AppointmentFormData) => apiRequest("POST", "/api/appointments", data), // Assumindo que apiRequest é para mutações
    ...mutationOptions,
    onSuccess: () => {
        mutationOptions.onSuccess();
        toast({ title: "Agendamento criado com sucesso" });
    }
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: (data: AppointmentFormData) => apiRequest("PUT", `/api/appointments/${appointment!.id}`, data), // Assumindo que apiRequest é para mutações
    ...mutationOptions,
    onSuccess: () => {
        mutationOptions.onSuccess();
        toast({ title: "Agendamento atualizado com sucesso" });
    }
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

  const handleDentistChange = (dentistId: string) => {
    const selectedDentist = dentists.find(d => d.id === dentistId);
    const defaultDuration = (selectedDentist as any)?.defaultAppointmentDuration || 60;
    
    setFormData(prev => ({ 
      ...prev, 
      dentistId,
      duration: defaultDuration
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
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
                  <div className="p-2">
                      <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                          <Input 
                              placeholder="Buscar paciente pelo nome..."
                              className="pl-8"
                              value={patientSearchTerm}
                              onChange={(e) => setPatientSearchTerm(e.target.value)}
                          />
                      </div>
                  </div>
                  {patientsLoading && (
                      <div className="flex items-center justify-center p-2 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Buscando...
                      </div>
                  )}
                  {!patientsLoading && foundPatients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.fullName}
                    </SelectItem>
                  ))}
                   {!patientsLoading && foundPatients.length === 0 && (
                      <div className="text-center text-sm text-gray-500 p-2">
                          {debouncedSearchTerm ? "Nenhum paciente encontrado." : "Digite para buscar um paciente."}
                      </div>
                   )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dentistId">Dentista *</Label>
              <Select value={formData.dentistId} onValueChange={handleDentistChange} required>
                <SelectTrigger><SelectValue placeholder="Selecione um dentista" /></SelectTrigger>
                <SelectContent>
                  {dentists.map((dentist) => ( <SelectItem key={dentist.id} value={dentist.id}>{dentist.fullName}</SelectItem> ))}
                </SelectContent>
              </Select>
            </div>

            {/* --- CAMPOS RESTAURADOS --- */}
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
                min="15" max="480" step="15"
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

          {/* --- BOTÕES RESTAURADOS --- */}
          <div className="flex justify-between pt-4 border-t">
            {appointment && onDelete && (
              <Button type="button" variant="destructive" onClick={() => { if(appointment) onDelete(appointment); onClose(); }}>
                Excluir
              </Button>
            )}

            <div className="flex space-x-3 ml-auto">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createAppointmentMutation.isPending || updateAppointmentMutation.isPending}>
                {createAppointmentMutation.isPending || updateAppointmentMutation.isPending
                  ? "Salvando..."
                  : appointment ? "Atualizar" : "Criar Agendamento"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}