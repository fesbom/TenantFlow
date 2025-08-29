import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  Plus,
  UserPlus,
  Receipt,
  Cake,
  MessageCircle,
} from "lucide-react";
import { Appointment, Patient } from "@/types";

interface DashboardStats {
  activePatients: number;
  todayAppointments: number;
  monthlyRevenue: number;
  attendanceRate: number;
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  // Fetch today's appointments
  const { data: todayAppointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/dashboard/today-appointments"],
  });

  // Fetch birthday patients
  const { data: birthdayPatients = [], isLoading: birthdaysLoading } = useQuery({
    queryKey: ["/api/dashboard/birthday-patients"],
    refetchOnWindowFocus: true, // Força a busca ao focar na aba
    staleTime: 0, // Considera os dados sempre "velhos" para forçar re-fetch
    gcTime: 0, // Remove completamente o cache (nova API do React Query)
  }) as { data: Patient[], isLoading: boolean };

  const handleSendBirthdayMessage = async (patient: Patient) => {
    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("dental_token")}`,
        },
        body: JSON.stringify({
          phone: patient.phone,
          message: `🎉 Feliz aniversário, ${patient.full_name}! Desejamos um dia maravilhoso e muito especial! 🎂`,
          type: "birthday",
        }),
      });

      if (response.ok) {
        toast({
          title: "Mensagem enviada!",
          description: `Mensagem de aniversário enviada para ${patient.full_name}`,
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao enviar mensagem",
        description: "Não foi possível enviar a mensagem via WhatsApp",
        variant: "destructive",
      });
    }
  };

  const statsCards = [
    {
      title: "Pacientes Ativos",
      value: stats?.activePatients ?? 0,
      change: "+12%",
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Agendamentos Hoje",
      value: stats?.todayAppointments ?? 0,
      change: "+5",
      icon: Calendar,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Taxa de Presença",
      value: `${stats?.attendanceRate ?? 0}%`,
      change: "+3%",
      icon: TrendingUp,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
  ];

  const quickActions = [
    {
      title: "Novo Agendamento",
      description: "Agendar consulta",
      icon: Plus,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      href: "/appointments",
    },
    {
      title: "Cadastrar Paciente",
      description: "Novo paciente",
      icon: UserPlus,
      color: "text-green-600",
      bgColor: "bg-green-100",
      href: "/patients",
    },
  ];

  return (
    <div className="app-container bg-slate-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      
      <div className="main-content">
        <Header title="Dashboard" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-6 flex-grow">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsCards.map((stat, index) => (
              <Card key={index} className="border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                      <p className="text-3xl font-bold text-gray-900" data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        {statsLoading ? "..." : stat.value}
                      </p>
                    </div>
                    <div className={`h-12 w-12 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm">
                    <span className="text-green-600 font-medium">{stat.change}</span>
                    <span className="text-gray-600 ml-1">vs mês anterior</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickActions.map((action, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    className="w-full justify-start h-auto p-3 hover:bg-gray-50"
                    onClick={() => setLocation(action.href)}
                    data-testid={`action-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className={`h-8 w-8 ${action.bgColor} rounded-lg flex items-center justify-center mr-3`}>
                      <action.icon className={`h-4 w-4 ${action.color}`} />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">{action.title}</div>
                    </div>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Today's Appointments */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Agenda de Hoje</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {appointmentsLoading ? (
                  <div className="text-center text-gray-500">Carregando...</div>
                ) : todayAppointments.length === 0 ? (
                  <div className="text-center text-gray-500">Nenhum agendamento para hoje</div>
                ) : (
                  todayAppointments.slice(0, 3).map((appointment) => (
                    <div key={appointment.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="text-center">
                        <div className="text-sm font-medium text-gray-900">
                          {new Date(appointment.scheduledDate).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Paciente #{appointment.patientId.slice(-6)}</p>
                        <p className="text-xs text-gray-600">{appointment.procedure || "Consulta"}</p>
                      </div>
                      <Badge
                        variant={
                          appointment.status === "completed" ? "default" :
                          appointment.status === "in_progress" ? "secondary" :
                          "outline"
                        }
                        className="text-xs"
                      >
                        {appointment.status === "scheduled" && "Agendado"}
                        {appointment.status === "in_progress" && "Em atendimento"}
                        {appointment.status === "completed" && "Concluído"}
                        {appointment.status === "cancelled" && "Cancelado"}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Birthday Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Aniversariantes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {birthdaysLoading ? (
                  <div className="text-center text-gray-500">Carregando...</div>
                ) : birthdayPatients.length === 0 ? (
                  <div className="text-center text-gray-500">Nenhum aniversariante hoje</div>
                ) : (
                  birthdayPatients.map((patient: any) => (
                      <div key={patient.id} className="flex items-center space-x-3 p-3 bg-pink-50 rounded-lg border border-pink-200">
                      <div className="h-10 w-10 bg-pink-100 rounded-full flex items-center justify-center">
                        <Cake className="h-5 w-5 text-pink-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{patient.full_name}</p>
                        <p className="text-xs text-gray-600">Aniversário hoje</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSendBirthdayMessage(patient)}
                        className="text-primary hover:text-primary/80"
                        data-testid={`birthday-message-${patient.id}`}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 gap-6">
            {/* Appointments Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Atendimentos por Período</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <TrendingUp className="h-12 w-12 mx-auto mb-2" />
                    <p>Gráfico de Atendimentos</p>
                    <p className="text-sm">(Em desenvolvimento)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
