import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, View, Views, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import "react-big-calendar/lib/css/react-big-calendar.css";
import './Calendar.css';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Appointment, Patient, User } from "@/types";
import AppointmentModal from "@/components/modals/appointment-modal";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter } from "lucide-react";
import moment from "moment";
import 'moment/locale/pt-br';

// Configura o moment para o Português (Brasil)
moment.locale('pt-br');

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

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Appointment;
}

interface CalendarViewProps {
  className?: string;
}

export default function CalendarView({ className = "" }: CalendarViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [selectedDentist, setSelectedDentist] = useState<string>("all");
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [newAppointmentSlot, setNewAppointmentSlot] = useState<{ start: Date; end: Date } | null>(null);

  // --- TODAS AS CHAMADAS useQuery CORRIGIDAS ---
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    queryFn: ({ queryKey }) => fetchData(queryKey[0]),
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
    queryFn: ({ queryKey }) => fetchData(queryKey[0]),
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

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return filteredAppointments.map(appointment => {
      // Fix timezone: treat UTC time as local time (no conversion)
      const dataDoBanco = new Date(appointment.scheduledDate);
      const start = new Date(
        dataDoBanco.getUTCFullYear(),
        dataDoBanco.getUTCMonth(),
        dataDoBanco.getUTCDate(),
        dataDoBanco.getUTCHours(),
        dataDoBanco.getUTCMinutes()
      );
      const end = new Date(start.getTime() + (appointment.duration || 60) * 60000);
      return {
        id: appointment.id,
        title: `${getPatientName(appointment.patientId)} - ${appointment.procedure || 'Consulta'}`,
        start,
        end,
        resource: appointment,
      };
    });
  }, [filteredAppointments, patients, users]);

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    setNewAppointmentSlot({ start, end });
    setSelectedAppointment(null);
    setIsAppointmentModalOpen(true);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedAppointment(event.resource);
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

  const handleNavigate = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handleViewChange = (view: View) => {
    setCurrentView(view);
  };

  const EventComponent = ({ event }: { event: CalendarEvent }) => {
    const appointment = event.resource;
    const statusColors = {
      scheduled: "bg-blue-100 border-blue-500 text-blue-800",
      in_progress: "bg-yellow-100 border-yellow-500 text-yellow-800",
      completed: "bg-green-100 border-green-500 text-green-800",
      cancelled: "bg-red-100 border-red-500 text-red-800",
    };
    const colorClass = statusColors[appointment.status as keyof typeof statusColors] || statusColors.scheduled;

    return (
      <div className={`p-1 rounded border-l-4 text-xs ${colorClass} h-full overflow-hidden`}>
        <div className="font-medium truncate">{getPatientName(appointment.patientId)}</div>
        <div className="text-xs opacity-75 truncate">{appointment.procedure || "Consulta"}</div>
      </div>
    );
  };

  const locales = { 'pt-BR': ptBR };
  const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

  const formats = {
    weekdayFormat: (date: Date, culture: any, localizer: any) => localizer.format(date, 'ddd', culture),
    dayHeaderFormat: (date: Date, culture: any, localizer: any) => localizer.format(date, 'ddd DD/MM', culture),
    monthHeaderFormat: (date: Date, culture: any, localizer: any) => localizer.format(date, 'MMMM yyyy', culture),
    timeGutterFormat: (date: Date, culture: any, localizer: any) => localizer.format(date, 'HH:mm', culture),
  };

  const CustomToolbar = (toolbar: any) => {
    const goToBack = () => toolbar.onNavigate('PREV');
    const goToNext = () => toolbar.onNavigate('NEXT');
    const goToCurrent = () => toolbar.onNavigate('TODAY');
    const view = (view: View) => toolbar.onView(view);

    return (
      <CardHeader className="pb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <CardTitle className="flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5" />
                <span>Agenda - {toolbar.view}</span>
            </CardTitle>
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <Select value={selectedDentist} onValueChange={setSelectedDentist}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar dentista..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os Dentistas</SelectItem>
                            {dentists.map(dentist => (<SelectItem key={dentist.id} value={dentist.id}>{dentist.fullName}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex border rounded-lg">
                    <Button variant={toolbar.view === Views.DAY ? "default" : "ghost"} size="sm" onClick={() => view(Views.DAY)} className="rounded-r-none">Dia</Button>
                    <Button variant={toolbar.view === Views.WEEK ? "default" : "ghost"} size="sm" onClick={() => view(Views.WEEK)} className="rounded-none">Semana</Button>
                    <Button variant={toolbar.view === Views.MONTH ? "default" : "ghost"} size="sm" onClick={() => view(Views.MONTH)} className="rounded-l-none">Mês</Button>
                </div>
            </div>
        </div>
        <div className="flex items-center justify-between pt-4">
            <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" onClick={goToBack}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={goToCurrent}>Hoje</Button>
                <Button variant="outline" size="sm" onClick={goToNext}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="text-lg font-medium text-gray-900 hidden lg:block">
                {toolbar.label}
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>{filteredAppointments.length} agendamento{filteredAppointments.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
      </CardHeader>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardContent className="p-0">
          {(appointmentsLoading || patientsLoading) ? (
            <div className="h-96 flex items-center justify-center text-gray-500">
              <CalendarIcon className="h-8 w-8 mr-2 animate-spin" />
              Carregando agenda...
            </div>
          ) : (
            <div className="h-[75vh]">
              <Calendar
                components={{
                  toolbar: CustomToolbar,
                  event: EventComponent,
                }}
                localizer={localizer}
                culture="pt-BR"
                formats={formats}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                views={[Views.MONTH, Views.WEEK, Views.DAY]}
                view={currentView}
                date={currentDate}
                onView={handleViewChange}
                onNavigate={handleNavigate}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                selectable={true}
                popup={true}
                showMultiDayTimes={true}
                step={30}
                timeslots={2}
                min={new Date(2024, 0, 1, 7, 0)} // 7:00 AM
                max={new Date(2024, 0, 1, 20, 0)} // 8:00 PM
                messages={{
                  allDay: "Dia todo",
                  previous: "Anterior",
                  next: "Próximo",
                  today: "Hoje",
                  month: "Mês",
                  week: "Semana",
                  day: "Dia",
                  agenda: "Agenda",
                  date: "Data",
                  time: "Hora",
                  event: "Evento",
                  noEventsInRange: "Não há eventos neste período.",
                  showMore: (total: number) => `+ ${total} mais`,
                }}
              />
            </div>
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
        patients={patients}
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