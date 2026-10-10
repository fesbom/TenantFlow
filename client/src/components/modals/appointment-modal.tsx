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
import { Search, Loader2, MessageSquareText, CheckCircle2, XCircle, History } from "lucide-react";

// Função de busca genérica
const fetchData = async (url: string) => {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
    });
    if (!response.ok) throw new Error('A resposta da rede não foi bem-sucedida');
    return response.json();
};

function getRequestErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Verifique os dados e tente novamente.";
  const responseBody = error.message.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(responseBody);
    return typeof parsed.message === "string" ? parsed.message : responseBody;
  } catch {
    return responseBody;
  }
}

interface PaginatedPatientsResponse {
    data: Patient[];
}

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  initialDateTime?: Date;
  initialDentistId?: string;
  onDelete?: (appointment: Appointment) => void;
  dentists: User[];
  patientName?: string;
}

interface AppointmentFormData {
  patientId: string;
  dentistId: string;
  scheduledDate: string;
  duration: number;
  procedure: string;
  notes: string;
  status: string;
}

interface ConfirmationHistoryEntry {
  id: string;
  action: string;
  origin: "automatic" | "patient" | "manual";
  reason: string | null;
  message: string | null;
  providerMessageId: string | null;
  deliveryStatus: string | null;
  actorName: string | null;
  createdAt: string;
}

export default function AppointmentModal({ 
    isOpen, 
    onClose, 
    appointment, 
    initialDateTime, 
  initialDentistId,
    onDelete,
    dentists,
    patientName,
}: AppointmentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [refusalReason, setRefusalReason] = useState("");

  const [formData, setFormData] = useState<AppointmentFormData>({
    patientId: "", dentistId: "", scheduledDate: "", duration: 60, procedure: "", notes: "", status: "scheduled",
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

  const historyUrl = appointment ? `/api/appointments/${appointment.id}/confirmation-history` : "";
  const { data: confirmationHistory = [], isLoading: historyLoading } = useQuery<ConfirmationHistoryEntry[]>({
    queryKey: [historyUrl],
    enabled: isOpen && !!appointment,
  });
  
  // Combine current patient with search results, avoiding duplicates
  const foundPatients = (() => {
      const searchResults = patientsResponse?.data || [];
      const currentPatientOption = currentPatientResponse ?? (
      appointment?.patientId && patientName
        ? { id: appointment.patientId, fullName: patientName }
        : undefined
      );
      if (currentPatientOption && !searchResults.find(p => p.id === currentPatientOption.id)) {
        return [currentPatientOption, ...searchResults];
      }
      return searchResults;
  })();
  const selectedPatientId = formData.patientId || appointment?.patientId || "";
  const selectedPatientLabel = foundPatients.find((patient) => patient.id === selectedPatientId)?.fullName
    ?? (selectedPatientId ? patientName || "Carregando paciente..." : undefined);

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
                status: appointment.status || "scheduled",
            });
        } else {
            let formattedDateTime = "";
            if (initialDateTime) {
                const d = initialDateTime;
                formattedDateTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            }
            const initialDentist = dentists.find((dentist) => dentist.id === initialDentistId) as any;
            setFormData({
              patientId: "", dentistId: initialDentistId || "", scheduledDate: formattedDateTime, duration: initialDentist?.defaultAppointmentDuration || 60, procedure: "", notes: "", status: "scheduled",
            });
        }
        setPatientSearchTerm("");
        setDebouncedSearchTerm("");
    }
  }, [appointment, dentists, initialDateTime, initialDentistId, isOpen]);

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

  const confirmationActionMutation = useMutation({
    mutationFn: async (payload: { action: "send_confirmation" | "accept" | "refuse"; reason?: string }) => {
      if (!appointment) throw new Error("Agendamento não selecionado.");
      const response = await apiRequest("POST", `/api/appointments/${appointment.id}/confirmation-actions`, payload);
      return response.json();
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: [historyUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      if (result.status) setFormData((previous) => ({ ...previous, status: result.status }));
      setRefusalReason("");
      const message = variables.action === "send_confirmation"
        ? result.simulated
          ? "Confirmação enviada ao simulador de WhatsApp; responda por lá para testar o agendamento."
          : "Solicitação aceita pela Evolution; aguardando confirmação de entrega."
        : variables.action === "accept"
          ? "Aceite registrado manualmente."
          : "Recusa registrada manualmente.";
      toast({ title: "Ação registrada", description: message });
    },
    onError: (error: unknown, variables: { action: "send_confirmation" | "accept" | "refuse"; reason?: string }) => {
      const actionTitle = variables.action === "send_confirmation"
        ? "Não foi possível enviar a confirmação"
        : variables.action === "accept"
          ? "Não foi possível registrar o aceite"
          : "Não foi possível registrar a recusa";
      toast({
        title: actionTitle,
        description: getRequestErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleManualRefusal = () => {
    const reason = refusalReason.trim();
    confirmationActionMutation.mutate({ action: "refuse", ...(reason ? { reason } : {}) });
  };

  const historyActionLabel: Record<string, string> = {
    confirmation_sent: "Confirmação enviada",
    confirmation_warning_sent: "Último aviso enviado",
    confirmation_failed: "Falha no envio da confirmação",
    accepted: "Agendamento aceito",
    refused: "Agendamento recusado",
    cancelled_no_response: "Cancelado por falta de resposta",
    refusal_reason_requested: "Motivo da recusa solicitado",
    refusal_reason_provided: "Motivo da recusa informado",
  };
  const historyOriginLabel: Record<ConfirmationHistoryEntry["origin"], string> = {
    automatic: "Automático",
    patient: "Paciente",
    manual: "Manual",
  };
  const deliveryStatusLabel: Record<string, string> = {
    simulated: "Disponível no simulador de WhatsApp",
    accepted: "Aceita pela Evolution; aguardando ACK de entrega",
    pending: "Pendente de entrega",
    server_ack: "Recebida pelo servidor WhatsApp",
    delivered: "Entregue no WhatsApp",
    read: "Lida pelo paciente",
    failed: "Falha na entrega",
  };

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

  // Split the combined "YYYY-MM-DDTHH:mm" into separate date/time parts for display
  const [datePart, timePart] = formData.scheduledDate.split("T");

  const handleDateChange = (value: string) => {
    handleInputChange("scheduledDate", `${value}T${timePart || "00:00"}`);
  };

  // Free-text time field: keeps only digits, auto-inserts the ":" so the user
  // can type "0900" and get "09:00" without opening any native picker widget.
  const handleTimeChange = (rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    handleInputChange("scheduledDate", `${datePart || ""}T${formatted}`);
  };

  const handleDentistChange = (dentistId: string) => {
    const selectedDentist = dentists.find(d => d.id === dentistId);
    const defaultDuration = (selectedDentist as any)?.defaultAppointmentDuration || 60;
    
    setFormData(prev => ({ 
      ...prev, 
      dentistId,
      duration: defaultDuration,
      scheduledDate: prev.scheduledDate,
    }));
  };

  // Calculate maximum duration: from scheduled time to midnight (next day start)
  const calculateMaxDuration = (): number => {
    if (!formData.scheduledDate) return 480; // Default 8 hours if no date set
    
    const scheduledDateTime = new Date(formData.scheduledDate);
    const nextDayStart = new Date(scheduledDateTime);
    nextDayStart.setHours(24, 0, 0, 0); // Start of next day (midnight)
    
    const diffMs = nextDayStart.getTime() - scheduledDateTime.getTime();
    const maxMinutes = Math.ceil(diffMs / (1000 * 60));
    
    return Math.max(5, maxMinutes); // Minimum 5 minutes
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
                value={selectedPatientId}
                onValueChange={(value) => handleInputChange("patientId", value)}
                required
              >
                <SelectTrigger data-testid="select-appointment-patient">
                  <SelectValue placeholder="Selecione um paciente">
                    {selectedPatientLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  onPointerDownOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('input') || target.tagName === 'INPUT') {
                      e.preventDefault();
                    }
                  }}
                >
                  <div className="p-2" onPointerDown={(e) => e.stopPropagation()}>
                      <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                          <Input 
                              placeholder="Buscar paciente pelo nome..."
                              className="pl-8"
                              value={patientSearchTerm}
                              onChange={(e) => setPatientSearchTerm(e.target.value)}
                              onKeyDown={(e) => e.stopPropagation()}
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
              <div className="flex gap-2">
                <Input
                  id="scheduledDate"
                  type="date"
                  className="flex-1"
                  value={datePart || ""}
                  onChange={(e) => handleDateChange(e.target.value)}
                  required
                  data-testid="input-appointment-date"
                />
                <Input
                  id="scheduledTime"
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  maxLength={5}
                  className="w-24"
                  value={timePart || ""}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  required
                  data-testid="input-appointment-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duração (minutos)</Label>
              <Input
                id="duration"
                type="number"
                min="5"
                max={calculateMaxDuration()}
                step="1"
                value={formData.duration}
                onChange={(e) => handleInputChange("duration", parseInt(e.target.value))}
                data-testid="input-appointment-duration"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                <SelectTrigger id="status" data-testid="select-appointment-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Aguardando confirmação</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="cancelled">Cancelado / desmarcado</SelectItem>
                  <SelectItem value="scheduled">Agendado</SelectItem>
                </SelectContent>
              </Select>
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

            {appointment && (
              <section className="md:col-span-2 space-y-3 border-t pt-4" aria-label="Confirmações do agendamento">
                <div className="flex items-center gap-2 font-medium">
                  <History className="h-4 w-4" />
                  Histórico de confirmação
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => confirmationActionMutation.mutate({ action: "send_confirmation" })}
                    disabled={confirmationActionMutation.isPending}
                  >
                    <MessageSquareText className="mr-1.5 h-4 w-4" /> Enviar confirmação
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => confirmationActionMutation.mutate({ action: "accept" })}
                    disabled={confirmationActionMutation.isPending}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-700" /> Aceitar manualmente
                  </Button>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea
                    value={refusalReason}
                    onChange={(event) => setRefusalReason(event.target.value)}
                    placeholder="Motivo da recusa (opcional)"
                    rows={2}
                    aria-label="Motivo da recusa manual (opcional)"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    className="shrink-0 sm:self-end"
                    onClick={handleManualRefusal}
                    disabled={confirmationActionMutation.isPending}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" /> Recusar manualmente
                  </Button>
                </div>

                <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3" data-testid="appointment-confirmation-history">
                  {historyLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando histórico...</p>
                  ) : confirmationHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem ou ação de confirmação registrada.</p>
                  ) : confirmationHistory.map((entry) => (
                    <div key={entry.id} className="border-b pb-2 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium">{historyActionLabel[entry.action] || entry.action}</span>
                        <time className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString("pt-BR")}</time>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {historyOriginLabel[entry.origin]}{entry.origin === "manual" && entry.actorName ? `: ${entry.actorName}` : ""}
                      </p>
                      {entry.deliveryStatus && (
                        <p className="text-xs font-medium text-muted-foreground">
                          Entrega: {deliveryStatusLabel[entry.deliveryStatus] || entry.deliveryStatus}
                        </p>
                      )}
                      {entry.reason && <p className="mt-1 text-sm">Motivo: {entry.reason}</p>}
                      {entry.message && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{entry.message}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
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