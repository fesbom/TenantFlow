import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, momentLocalizer, View, Views,dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import "react-big-calendar/lib/css/react-big-calendar.css";
import './Calendar.css'; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Appointment, Patient, User } from "@/types";
import AppointmentModal from "@/components/modals/appointment-modal";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter } from "lucide-react";


// Configure moment for Portuguese
import moment from "moment";
const localizer = momentLocalizer(moment);
import 'moment/locale/pt-br';
moment.updateLocale('pt-br', {
  weekdaysShort: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
})
moment.locale('pt-br');

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

  // State management
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [selectedDentist, setSelectedDentist] = useState<string>("all");
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [newAppointmentSlot, setNewAppointmentSlot] = useState<{ start: Date; end: Date } | null>(null);

  // Fetch data
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: patientsResponse } = useQuery<{ data: Patient[]; pagination: any }>({
    queryKey: ["/api/patients", { page: 1, pageSize: 5000 }],
  });
  
  const patients = patientsResponse?.data || [];

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const dentists = users.filter(user => user.role === "dentist");

  // Delete appointment mutation
  const deleteAppointmentMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      return await apiRequest("DELETE", `/api/appointments/${appointmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Agendamento excluído",
        description: "O agendamento foi removido com sucesso.",
      });
      setAppointmentToDelete(null);
    },
    onError: () => {
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o agendamento.",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const getPatientName = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.fullName : `Paciente #${patientId.slice(-6)}`;
  };

  const getDentistName = (dentistId: string) => {
    const dentist = users.find(u => u.id === dentistId);
    return dentist ? dentist.fullName : `Dentista #${dentistId.slice(-6)}`;
  };

  // Filter appointments by selected dentist
  const filteredAppointments = useMemo(() => {
    if (selectedDentist === "all") return appointments;
    return appointments.filter(apt => apt.dentistId === selectedDentist);
  }, [appointments, selectedDentist]);

  // Convert appointments to calendar events
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return filteredAppointments.map(appointment => {
      // NO TIMEZONE CONVERSION - Create date as if it's already local
      // Database has "2025-08-25T16:00:00.000Z" → force it to be treated as "16:00" local
      const appointmentDate = new Date(appointment.scheduledDate);

      // Force the calendar to interpret this as local time by creating a new Date 
      // with the UTC values used as if they were local values
      const start = new Date(
        appointmentDate.getUTCFullYear(),
        appointmentDate.getUTCMonth(), 
        appointmentDate.getUTCDate(),
        appointmentDate.getUTCHours(),
        appointmentDate.getUTCMinutes(),
        appointmentDate.getUTCSeconds()
      );
      const end = new Date(start.getTime() + (appointment.duration || 60) * 60000); // duration in minutes

      return {
        id: appointment.id,
        title: `${getPatientName(appointment.patientId)} - ${getDentistName(appointment.dentistId)}`,
        start,
        end,
        resource: appointment,
      };
    });
  }, [filteredAppointments, patients, users]);

  // Event handlers
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

  const handleNavigate = (action: 'PREV' | 'NEXT' | 'TODAY') => {
    const newDate = new Date(currentDate);

    if (action === 'TODAY') {
      setCurrentDate(new Date());
    } else if (action === 'PREV') {
      if (currentView === Views.MONTH) {
        newDate.setMonth(newDate.getMonth() - 1);
      } else if (currentView === Views.WEEK) {
        newDate.setDate(newDate.getDate() - 7);
      } else {
        newDate.setDate(newDate.getDate() - 1);
      }
      setCurrentDate(newDate);
    } else if (action === 'NEXT') {
      if (currentView === Views.MONTH) {
        newDate.setMonth(newDate.getMonth() + 1);
      } else if (currentView === Views.WEEK) {
        newDate.setDate(newDate.getDate() + 7);
      } else {
        newDate.setDate(newDate.getDate() + 1);
      }
      setCurrentDate(newDate);
    }
  };

  const handleViewChange = (view: View) => {
    setCurrentView(view);
  };

  // Custom event component
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

  const getViewName = () => {
    switch (currentView) {
      case Views.MONTH: return "Mês";
      case Views.WEEK: return "Semana";  
      case Views.DAY: return "Dia";
      default: return "Agenda";
    }
  };
  
  const locales = {
    'pt-BR': ptBR,
  }

  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
  })
  
  const formats = {
    // cabeçalho das colunas (seg, ter, qua...)
    weekdayFormat: (date: Date) => moment(date).format("ddd"),

    // cabeçalho quando estiver em view=week ou view=day
    dayHeaderFormat: (date: Date) => moment(date).format("ddd DD/MM"),

    // cabeçalho do mês (set 2025)
    monthHeaderFormat: (date: Date) => moment(date).format("MMM YYYY"),

    // (opcional) outras personalizações
    timeGutterFormat: (date: Date) => moment(date).format("HH:mm"),
    eventTimeRangeFormat: ({ start, end }: any) =>
      `${moment(start).format("HH:mm")} - ${moment(end).format("HH:mm")}`,
  }

  
  const formatCurrentDate = () => {
    if (currentView === Views.MONTH) {
      return moment(currentDate).format('MMMM YYYY');
    } else if (currentView === Views.WEEK) {
      const startWeek = moment(currentDate).startOf('week');
      const endWeek = moment(currentDate).endOf('week');
      return `${startWeek.format('DD/MM')} - ${endWeek.format('DD/MM/YYYY')}`;
    } else {
      return moment(currentDate).format('DD/MM/YYYY - dddd');
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Calendar Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <CardTitle className="flex items-center space-x-2">
              <CalendarIcon className="h-5 w-5" />
              <span>Agenda - {getViewName()}</span>
            </CardTitle>

            <div className="flex flex-col lg:flex-row gap-4">
              {/* Dentist Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={selectedDentist} onValueChange={setSelectedDentist}>
                  <SelectTrigger className="w-48" data-testid="select-dentist-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Dentistas</SelectItem>
                    {dentists.map(dentist => (
                      <SelectItem key={dentist.id} value={dentist.id}>
                        {dentist.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* View Buttons */}
              <div className="flex border rounded-lg">
                <Button
                  variant={currentView === Views.DAY ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleViewChange(Views.DAY)}
                  className="rounded-r-none"
                  data-testid="button-day-view"
                >
                  Dia
                </Button>
                <Button
                  variant={currentView === Views.WEEK ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleViewChange(Views.WEEK)}
                  className="rounded-none"
                  data-testid="button-week-view"
                >
                  Semana
                </Button>
                <Button
                  variant={currentView === Views.MONTH ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleViewChange(Views.MONTH)}
                  className="rounded-l-none"
                  data-testid="button-month-view"
                >
                  Mês
                </Button>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNavigate('PREV')}
                data-testid="button-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNavigate('TODAY')}
                data-testid="button-today"
              >
                Hoje
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNavigate('NEXT')}
                data-testid="button-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-lg font-medium text-gray-900">
              {formatCurrentDate()}
            </div>

            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>{filteredAppointments.length} agendamento{filteredAppointments.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {appointmentsLoading ? (
            <div className="h-96 flex items-center justify-center text-gray-500">
              <CalendarIcon className="h-8 w-8 mr-2" />
              Carregando agenda...
            </div>
          ) : (
            <div className="h-[600px]">
              <Calendar
                toolbar={false}
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
                onNavigate={setCurrentDate}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                selectable={true}
                popup={true}
                showMultiDayTimes={true}
                step={30}
                timeslots={2}
                min={new Date(2024, 0, 1, 7, 0)} // 8:00 AM
                max={new Date(2024, 0, 1, 20, 0)} // 8:00 PM
                timezone="local"
                components={{
                  event: EventComponent,
                }}
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
                  noEventsInRange: "Não há eventos neste período",
                  showMore: (total: number) => `+ ${total} mais`,
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointment Modal */}
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
      />

      {/* Delete Confirmation Dialog */}
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
              data-testid="confirm-delete-appointment"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}