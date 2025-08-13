import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, Clock, User } from "lucide-react";
import { Appointment, Patient } from "@/types";

export default function Appointments() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch appointments
  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  // Fetch patients for reference
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  const getPatientName = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.fullName : `Paciente #${patientId.slice(-6)}`;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('pt-BR'),
      time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      scheduled: { label: "Agendado", variant: "outline" as const },
      in_progress: { label: "Em atendimento", variant: "secondary" as const },
      completed: { label: "Concluído", variant: "default" as const },
      cancelled: { label: "Cancelado", variant: "destructive" as const },
    };

    const config = statusMap[status as keyof typeof statusMap] || statusMap.scheduled;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Group appointments by date
  const groupedAppointments = appointments.reduce((groups, appointment) => {
    const date = formatDateTime(appointment.scheduledDate).date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(appointment);
    return groups;
  }, {} as Record<string, Appointment[]>);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="lg:pl-64">
        <Header title="Agendamentos" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6">
          {/* Actions */}
          <div className="flex justify-end mb-6">
            <Button data-testid="button-new-appointment">
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Button>
          </div>

          {/* Appointments List */}
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Carregando agendamentos...
              </CardContent>
            </Card>
          ) : Object.keys(groupedAppointments).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Nenhum agendamento encontrado</p>
                <Button className="mt-4" data-testid="button-first-appointment">
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Agendamento
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedAppointments)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([date, dayAppointments]) => (
                  <Card key={date}>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Calendar className="h-5 w-5" />
                        <span>{date}</span>
                        <Badge variant="secondary">
                          {dayAppointments.length} agendamento{dayAppointments.length > 1 ? 's' : ''}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {dayAppointments
                          .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
                          .map((appointment) => {
                            const { time } = formatDateTime(appointment.scheduledDate);
                            return (
                              <div
                                key={appointment.id}
                                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                data-testid={`appointment-${appointment.id}`}
                              >
                                <div className="flex items-center space-x-4">
                                  <div className="text-center min-w-[60px]">
                                    <div className="text-lg font-semibold text-gray-900">{time}</div>
                                    {appointment.duration && (
                                      <div className="text-xs text-gray-500 flex items-center justify-center">
                                        <Clock className="h-3 w-3 mr-1" />
                                        {appointment.duration}min
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-1">
                                      <User className="h-4 w-4 text-gray-400" />
                                      <span className="font-medium text-gray-900">
                                        {getPatientName(appointment.patientId)}
                                      </span>
                                    </div>
                                    
                                    {appointment.procedure && (
                                      <p className="text-sm text-gray-600">{appointment.procedure}</p>
                                    )}
                                    
                                    {appointment.notes && (
                                      <p className="text-sm text-gray-500 mt-1">{appointment.notes}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center space-x-3">
                                  {getStatusBadge(appointment.status)}
                                  
                                  <div className="flex space-x-1">
                                    <Button variant="ghost" size="sm" data-testid={`button-edit-appointment-${appointment.id}`}>
                                      Editar
                                    </Button>
                                    {appointment.status === 'scheduled' && (
                                      <Button variant="ghost" size="sm" data-testid={`button-start-appointment-${appointment.id}`}>
                                        Iniciar
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
