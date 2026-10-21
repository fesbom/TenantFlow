import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Appointment, Patient } from "@/types";
import { ProtectedImage } from "@/components/ui/protected-image";

interface DashboardStats {
  activePatients: number;
  todayAppointments: number;
  monthlyRevenue: number;
  attendanceRate: number;
  confirmationRate: number;
}

interface PaginatedBirthdayResponse {
  data: Patient[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [birthdayPage, setBirthdayPage] = useState(1);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + weekOffset * 7);
    return d;
  }, [weekOffset]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const weekLabel = `${weekStart.toLocaleDateString("pt-BR")} a ${weekEnd.toLocaleDateString("pt-BR")}`;

  const { data: weeklyData = [], isLoading: weeklyLoading } = useQuery<{ date: string; count: number }[]>({
    queryKey: ["/api/dashboard/weekly-attendances", toIso(weekStart)],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/weekly-attendances?start=${toIso(weekStart)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      if (!response.ok) throw new Error("Falha ao carregar atendimentos");
      return response.json();
    },
  });

  const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const chartData = weeklyData.map((item) => {
    const [y, m, d] = item.date.split("-").map(Number);
    return {
      label: `${weekdayNames[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
      count: item.count,
    };
  });
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

  // Fetch birthday patients with pagination --- CÓDIGO CORRIGIDO AQUI ---
  const { data: birthdayData, isLoading: birthdaysLoading } = useQuery<PaginatedBirthdayResponse>({
    queryKey: ["/api/dashboard/birthday-patients", { page: birthdayPage, pageSize: 5 }],
    queryFn: async ({ queryKey }) => {
      // queryKey aqui é o array: ["/api/...", { page: ..., pageSize: ... }]
      const [_key, params] = queryKey as [string, { page: number; pageSize: number }];

      // Construímos a URL com os parâmetros
      const url = `${_key}?page=${params.page}&pageSize=${params.pageSize}`;

      const response = await fetch(url, {
        headers: {
          // Não se esqueça de enviar o token de autorização, se sua API exigir
          Authorization: `Bearer ${localStorage.getItem("dental_token")}`,
        },
      });

      if (!response.ok) {
        // Se a resposta não for bem-sucedida, lançamos um erro
        throw new Error("A resposta da rede não foi bem-sucedida");
      }

      // Retornamos os dados em formato JSON
      return response.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });

  const birthdayPatients = birthdayData?.data || [];
  const birthdayPagination = birthdayData?.pagination;

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
          message: `🎉 Feliz aniversário, ${patient.fullName}! Desejamos um dia maravilhoso e muito especial! 🎂`,
          type: "birthday",
        }),
      });

      if (response.ok) {
        toast({
          title: "Mensagem enviada!",
          description: `Mensagem de aniversário enviada para ${patient.fullName}`,
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
      caption: "Movimentações ÷ agendamentos de hoje",
      icon: TrendingUp,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
    {
      title: "Taxa de Confirmação",
      value: `${stats?.confirmationRate ?? 0}%`,
      caption: "Confirmados ÷ agendamentos de hoje",
      icon: CheckCircle2,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
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
                      <p
                        className="text-3xl font-bold text-gray-900"
                        data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {statsLoading ? "..." : stat.value}
                      </p>
                    </div>
                    <div className={`h-12 w-12 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm">
                    {"change" in stat ? (
                      <>
                        <span className="text-green-600 font-medium">{stat.change}</span>
                        <span className="text-gray-600 ml-1">vs mês anterior</span>
                      </>
                    ) : (
                      <span className="text-gray-600">{stat.caption}</span>
                    )}
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
                    data-testid={`action-${action.title.toLowerCase().replace(/\s+/g, "-")}`}
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
                          {new Date(appointment.scheduledDate).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{(appointment as { patientName?: string | null }).patientName || `Paciente #${appointment.patientId.slice(-6)}`}</p>
                        <p className="text-xs text-gray-600">{appointment.procedure || "Consulta"}</p>
                      </div>
                      <Badge
                        variant={
                          appointment.status === "completed"
                            ? "default"
                            : appointment.status === "in_progress"
                            ? "secondary"
                            : "outline"
                        }
                        className={`flex items-center gap-1 text-xs ${
                          appointment.status === "pending" || appointment.status === "scheduled"
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : appointment.status === "confirmed"
                            ? "border-blue-300 bg-blue-50 text-blue-900"
                            : appointment.status === "cancelled"
                            ? "border-red-300 bg-red-50 text-red-900"
                            : ""
                        }`}
                      >
                        {(appointment.status === "pending" || appointment.status === "scheduled") && <Clock className="h-3 w-3" />}
                        {appointment.status === "confirmed" && <CheckCircle2 className="h-3 w-3" />}
                        {appointment.status === "cancelled" && <XCircle className="h-3 w-3" />}
                        {(appointment.status === "pending" || appointment.status === "scheduled") && "Agendado"}
                        {appointment.status === "confirmed" && "Confirmado"}
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
                  <>
                    {birthdayPatients.map((patient: Patient) => (
                      <div
                        key={patient.id}
                        className="flex items-center space-x-3 p-3 bg-pink-50 rounded-lg border border-pink-200"
                      >
                        {/* Patient Photo or Birthday Icon */}
                        <div className="group relative h-10 w-10 flex-shrink-0">
                          <div className="relative h-full w-full rounded-full overflow-hidden border-2 border-pink-300 bg-pink-100 flex items-center justify-center">
                            {patient.photoUrl ? (
                              <ProtectedImage
                                src={patient.photoUrl}
                                alt={patient.fullName}
                                className="w-full h-full object-cover"
                                data-testid={`img-birthday-photo-${patient.id}`}
                              />
                            ) : (
                              <User className="h-5 w-5 text-pink-600" />
                            )}
                          </div>
                          {/* Birthday Badge Overlay */}
                          <div className="absolute -bottom-1 -right-1 bg-pink-500 rounded-full p-0.5">
                            <Cake className="h-3 w-3 text-white" />
                          </div>
                          {patient.photoUrl && (
                            <div className="pointer-events-none absolute left-0 top-0 z-50 hidden h-48 w-48 overflow-hidden rounded-xl border-2 border-pink-300 bg-white shadow-xl group-hover:block">
                              <ProtectedImage
                                src={patient.photoUrl}
                                alt={patient.fullName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{patient.fullName}</p>
                          <p className="text-xs text-gray-600">Aniversário hoje</p>
                        </div>
                        {/* Birthday message button removed: handled in Comunicação Ativa */}
                      </div>
                    ))}

                    {/* Pagination Controls */}
                    {birthdayPagination && birthdayPagination.totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-xs text-gray-600">
                          {birthdayPatients.length} de {birthdayPagination.totalCount} aniversariantes
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBirthdayPage((p) => Math.max(1, p - 1))}
                            disabled={birthdayPage === 1}
                            data-testid="button-prev-birthday-page"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-xs text-gray-600">
                            {birthdayPagination.page}/{birthdayPagination.totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBirthdayPage((p) => Math.min(birthdayPagination.totalPages, p + 1))}
                            disabled={birthdayPage === birthdayPagination.totalPages}
                            data-testid="button-next-birthday-page"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 gap-6">
            {/* Appointments Chart */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-lg font-semibold">Atendimentos por Período</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setWeekOffset((w) => w - 1)}
                      data-testid="button-prev-week"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-gray-700 min-w-[170px] text-center" data-testid="text-week-period">
                      {weekLabel}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setWeekOffset((w) => w + 1)}
                      data-testid="button-next-week"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {weekOffset !== 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                        Hoje
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {weeklyLoading ? (
                    <div className="h-full flex items-center justify-center text-gray-500">Carregando...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" />
                        <YAxis allowDecimals={false} />
                        <Tooltip formatter={(v: number) => [v, "Atendimentos"]} />
                        <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}