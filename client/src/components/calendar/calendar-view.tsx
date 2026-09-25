import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import { viewDay, viewWeek, viewMonthGrid } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createCurrentTimePlugin } from "@schedule-x/current-time";
import { createScrollControllerPlugin } from "@schedule-x/scroll-controller";
import "temporal-polyfill/global";
import type {} from "temporal-spec/global";
import "@schedule-x/theme-default/dist/index.css";
import './Calendar.css';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Appointment, Patient, User } from "@/types";
import AppointmentModal from "@/components/modals/appointment-modal";
import { Calendar as CalendarIcon, Filter, Maximize2, Minimize2, Clock, CheckCircle2, XCircle } from "lucide-react";
import moment from "moment";
import 'moment/locale/pt-br';
import {
  AppointmentEventCard,
  AppointmentMonthGridEventCard,
  ScheduleXAppointmentEvent,
} from "./schedule-x-event-card";

// Configura o moment para o Português (Brasil)
moment.locale('pt-br');

/**
 * A aplicação grava/lê `scheduledDate` como um horário "de parede" (Brasília), sem conversão real de fuso.
 * Ancorar o calendário nesse fuso real (em vez de rotulá-lo como "UTC") faz com que os plugins que calculam
 * o instante atual de verdade (indicador de hora atual, rolagem automática) coincidam com essa convenção,
 * independente do fuso configurado no navegador do usuário.
 */
const APPOINTMENTS_TIME_ZONE = "America/Sao_Paulo";

// Função de busca genérica
const fetchData = async (url: string) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
  });
  if (!response.ok) {
    throw new Error('A resposta da rede não foi bem-sucedida');
  }
  return response.json();
};

interface PaginatedPatientsResponse {
  data: Patient[];
  pagination: any;
}

interface CalendarViewProps {
  className?: string;
}

/**
 * Custom components are kept module-scoped so Schedule-X does not remount them on every render.
 * https://schedule-x.dev/docs/frameworks/react#custom-components
 */
const scheduleXCustomComponents = {
  timeGridEvent: AppointmentEventCard,
  dateGridEvent: AppointmentEventCard,
  monthGridEvent: AppointmentMonthGridEventCard,
};

/** The DB stores scheduledDate as a wall-clock time encoded in UTC fields (no real timezone conversion). */
function dateToWallClockZonedDateTime(date: Date) {
  return Temporal.ZonedDateTime.from({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: 0,
    timeZone: APPOINTMENTS_TIME_ZONE,
  });
}

function zonedDateTimeToDate(zonedDateTime: Temporal.ZonedDateTime): Date {
  // Keep the wall-clock numbers as-is (Brasília time), regardless of the browser's own timezone.
  // AppointmentModal reads Date via local getters (getHours/getMinutes), so we build the Date
  // with the local constructor instead of converting the real UTC instant (epochMilliseconds).
  return new Date(
    zonedDateTime.year,
    zonedDateTime.month - 1,
    zonedDateTime.day,
    zonedDateTime.hour,
    zonedDateTime.minute,
  );
}

/** Clamps "now" (real Brasília time, not the browser's own timezone) to the visible day range. */
function currentTimeWithinBoundaries(dayStart: string, dayEnd: string): string {
  const now = Temporal.Now.zonedDateTimeISO(APPOINTMENTS_TIME_ZONE);
  const nowLabel = `${now.hour.toString().padStart(2, "0")}:${now.minute.toString().padStart(2, "0")}`;
  if (nowLabel < dayStart) return dayStart;
  if (nowLabel > dayEnd) return dayEnd;
  return nowLabel;
}

export default function CalendarView({ className = "" }: CalendarViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDentist, setSelectedDentist] = useState<string>("all");
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [newAppointmentSlot, setNewAppointmentSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // --- TODAS AS CHAMADAS useQuery CORRIGIDAS ---
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    queryFn: ({ queryKey }) => fetchData(queryKey[0] as string),
  });

  const { data: patientsResponse, isLoading: patientsLoading } = useQuery<PaginatedPatientsResponse>({
    queryKey: ["/api/patients", { page: 1, pageSize: 5000 }], // Pega todos para o seletor
    queryFn: ({ queryKey }) => {
      const [_key, params] = queryKey as [string, { page: number; pageSize: number }];
      const searchParams = new URLSearchParams({ 
          page: params.page.toString(), 
          pageSize: params.pageSize.toString() 
      });
      return fetchData(`${_key}?${searchParams.toString()}`);
    },
  });
  const patients = patientsResponse?.data || [];

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: ({ queryKey }) => fetchData(queryKey[0] as string),
  });

  const dentists = users.filter(user => user.role === "dentist");

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Falha ao excluir agendamento' }));
        throw new Error(errorData.message || 'Falha ao excluir agendamento');
      }
      return response.status === 204 ? {} : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Agendamento excluído", description: "O agendamento foi removido com sucesso." });
      setAppointmentToDelete(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao excluir", 
        description: error.message || "Não foi possível excluir o agendamento.",
        variant: "destructive" 
      });
    },
  });

  const getPatientName = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.fullName : `Paciente #${patientId.slice(-6)}`;
  };

  const getDentistName = (dentistId: string) => {
    const dentist = users.find(u => u.id === dentistId);
    return dentist ? dentist.fullName : `Dentista #${dentistId.slice(-6)}`;
  };

  const filteredAppointments = useMemo(() => {
    if (selectedDentist === "all") return appointments;
    return appointments.filter(apt => apt.dentistId === selectedDentist);
  }, [appointments, selectedDentist]);

  // Mapeia o payload de agendamentos da aplicação para o formato de evento do Schedule-X.
  const calendarEvents: ScheduleXAppointmentEvent[] = useMemo(() => {
    return filteredAppointments.map(appointment => {
      // Fix timezone: treat UTC time as local time (no conversion)
      const dataDoBanco = new Date(appointment.scheduledDate);
      const start = dateToWallClockZonedDateTime(dataDoBanco);
      const end = start.add({ minutes: appointment.duration || 60 });
      const patient = patients.find(p => p.id === appointment.patientId);

      return {
        id: appointment.id,
        title: `${getPatientName(appointment.patientId)} - ${appointment.procedure || 'Consulta'}`,
        start,
        end,
        appointment,
        patientName: getPatientName(appointment.patientId),
        dentistName: getDentistName(appointment.dentistId),
        patientPhotoUrl: patient?.photoUrl ?? undefined,
      };
    });
  }, [filteredAppointments, patients, users]);

  const handleSelectSlot = (start: Date, end: Date) => {
    setNewAppointmentSlot({ start, end });
    setSelectedAppointment(null);
    setIsAppointmentModalOpen(true);
  };

  const handleSelectEvent = (event: ScheduleXAppointmentEvent) => {
    setSelectedAppointment(event.appointment);
    setNewAppointmentSlot(null);
    setIsAppointmentModalOpen(true);
  };

  const handleDeleteAppointment = (appointment: Appointment) => {
    setAppointmentToDelete(appointment);
  };

  const confirmDeleteAppointment = () => {
    if (appointmentToDelete) {
      deleteAppointmentMutation.mutate(appointmentToDelete.id);
    }
  };

  // Plugins livres/MIT: sincronização de eventos, indicador de hora atual e rolagem automática.
  const [eventsService] = useState(() => createEventsServicePlugin());
  const [currentTimePlugin] = useState(() => createCurrentTimePlugin());
  const [scrollController] = useState(() =>
    createScrollControllerPlugin({ initialScroll: currentTimeWithinBoundaries("07:00", "20:00") }),
  );

  const calendar = useCalendarApp({
    locale: "pt-BR",
    timezone: APPOINTMENTS_TIME_ZONE,
    views: [viewDay, viewWeek, viewMonthGrid],
    defaultView: viewWeek.name,
    dayBoundaries: { start: "07:00", end: "20:00" },
    weekOptions: { gridStep: 30 },
    events: [],
    plugins: [eventsService, currentTimePlugin, scrollController],
    callbacks: {
      // Dispara a ação de visualização/edição atual da aplicação.
      onEventClick(calendarEvent: unknown) {
        handleSelectEvent(calendarEvent as ScheduleXAppointmentEvent);
      },
      onClickDateTime(dateTime: Temporal.ZonedDateTime) {
        const start = zonedDateTimeToDate(dateTime);
        const end = new Date(start.getTime() + 60 * 60000);
        handleSelectSlot(start, end);
      },
      onClickDate(date: Temporal.PlainDate) {
        const start = zonedDateTimeToDate(date.toZonedDateTime({ timeZone: APPOINTMENTS_TIME_ZONE, plainTime: "09:00" }));
        const end = new Date(start.getTime() + 60 * 60000);
        handleSelectSlot(start, end);
      },
    },
  });

  // Mantém os eventos do calendário sincronizados com os dados vindos da API.
  useEffect(() => {
    eventsService.set(calendarEvents as any);
  }, [calendarEvents, eventsService]);

  return (
    <div className={isMaximized ? "fixed inset-0 z-50 bg-slate-50 p-4 lg:p-6" : className}>
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 space-y-0 py-1.5">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Agenda</span>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-gray-500" />
            <Select value={selectedDentist} onValueChange={setSelectedDentist}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Filtrar dentista..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Dentistas</SelectItem>
                {dentists.map(dentist => (<SelectItem key={dentist.id} value={dentist.id}>{dentist.fullName}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden items-center gap-3 text-xs text-gray-600 xl:flex" aria-label="Legenda de status">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-600" />Aguardando</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-blue-800" />Confirmado</span>
            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-800" />Cancelado</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>{filteredAppointments.length} agendamento{filteredAppointments.length !== 1 ? 's' : ''}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsMaximized((maximized) => !maximized)}
              title={isMaximized ? "Restaurar tamanho da agenda" : "Maximizar agenda"}
              aria-label={isMaximized ? "Restaurar tamanho da agenda" : "Maximizar agenda"}
              data-testid="button-toggle-calendar-size"
            >
              {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          {(appointmentsLoading || patientsLoading) ? (
            <div className="h-96 flex items-center justify-center text-gray-500">
              <CalendarIcon className="h-8 w-8 mr-2 animate-spin" />
              Carregando agenda...
            </div>
          ) : (
            <ScheduleXCalendar calendarApp={calendar} customComponents={scheduleXCustomComponents} />
          )}
        </CardContent>
      </Card>

      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => {
          setIsAppointmentModalOpen(false);
          setSelectedAppointment(null);
          setNewAppointmentSlot(null);
        }}
        appointment={selectedAppointment}
        initialDateTime={newAppointmentSlot?.start}
        onDelete={handleDeleteAppointment}
        dentists={dentists}
      />

      <AlertDialog open={!!appointmentToDelete} onOpenChange={() => setAppointmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este agendamento?
              {appointmentToDelete && (
                <div className="mt-2 p-2 bg-gray-50 rounded">
                  <strong>Paciente:</strong> {getPatientName(appointmentToDelete.patientId)}<br />
                  <strong>Data:</strong> {moment(appointmentToDelete.scheduledDate).format('DD/MM/YYYY HH:mm')}<br />
                  <strong>Procedimento:</strong> {appointmentToDelete.procedure || "Consulta"}
                </div>
              )}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAppointment}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}