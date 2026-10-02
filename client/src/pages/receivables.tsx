import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { formatDateBR } from "@/lib/date-formatter";
import { ReceivableStatus } from "@/types";
import ReceivableEditModal from "@/components/modals/receivable-edit-modal";
import ReceivableReminderDialog from "@/components/modals/receivable-reminder-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DollarSign, AlertTriangle, CheckCircle2, HandCoins, Pencil, Layers3, Trash2, Ban, ChevronDown, SlidersHorizontal } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { normalizeBrazilianWhatsAppPhone } from "@shared/whatsapp-reminder";

interface ReceivableRow {
  id: string;
  patientId: string;
  dentistId: string;
  treatmentId: string | null;
  descricao: string;
  valor: string;
  dataVencimento: string;
  dataPagamento: string | null;
  status: ReceivableStatus;
  numeroParcela: number;
  totalParcelas: number;
  observacoes: string | null;
  patientName: string;
  patientPhone: string;
  dentistName: string;
}

interface ReceivablesResponse {
  data: ReceivableRow[];
  kpis: {
    totalAReceber: number;
    totalRecebido: number;
    totalInadimplente: number;
  };
}

interface DentistOption {
  id: string;
  fullName: string;
  role: string;
}

const STATUS_OPTIONS: { value: ReceivableStatus | "Todos"; label: string }[] = [
  { value: "Todos", label: "Todos" },
  { value: "Pendente", label: "Pendente" },
  { value: "Pago", label: "Pago" },
  { value: "Vencido", label: "Vencido" },
  { value: "Acordo", label: "Acordo" },
  { value: "Cancelado", label: "Cancelado" },
];

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ status }: { status: ReceivableStatus }) {
  const config: Record<ReceivableStatus, { label: string; className: string }> = {
    Pendente: { label: "Pendente", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
    Pago: { label: "Pago", className: "bg-green-100 text-green-800 hover:bg-green-100" },
    Vencido: { label: "Vencido", className: "bg-red-100 text-red-800 hover:bg-red-100" },
    Acordo: { label: "Acordo", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
    Cancelado: { label: "Cancelado", className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  };
  const { label, className } = config[status] ?? config.Pendente;
  return <Badge className={className}>{label}</Badge>;
}

export default function Receivables() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authContext = useAuth();
  const user = authContext?.user;
  const isAdmin = user?.role === "admin";
  const canManage = user?.role === "admin" || user?.role === "secretary";

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [status, setStatus] = useState<ReceivableStatus | "Todos">("Todos");
  const [dentistId, setDentistId] = useState<string>("Todos");
  const [indicatorsOpen, setIndicatorsOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [editingReceivable, setEditingReceivable] = useState<ReceivableRow | null>(null);
  const [editMode, setEditMode] = useState<"edit" | "installments">("edit");
  const [reminderReceivableId, setReminderReceivableId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (patientSearch) params.set("patientSearch", patientSearch);
  if (status && status !== "Todos") params.set("status", status);
  if (isAdmin && dentistId && dentistId !== "Todos") params.set("dentistId", dentistId);
  const url = `/api/receivables?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery<ReceivablesResponse>({
    queryKey: [url],
  });

  // Filtro de dentista fica disponível apenas para o ADMIN — o backend também
  // ignora este parâmetro para qualquer outro papel, então isto é só UX.
  const { data: dentists = [] } = useQuery<DentistOption[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });
  const dentistOptions = useMemo(
    () => dentists.filter((u) => u.role === "dentist"),
    [dentists],
  );

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status: newStatus }: { id: string; status: ReceivableStatus }) => {
      const response = await apiRequest("PATCH", `/api/receivables/${id}/status`, { status: newStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [url] });
      toast({ title: "Título atualizado", description: "Status atualizado com sucesso." });
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar título",
        description: "Não foi possível atualizar o status do título.",
        variant: "destructive",
      });
    },
  });

  const deleteReceivableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/receivables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [url] });
      toast({ title: "Título excluído", description: "A conta a receber foi removida." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erro ao excluir título",
        description: error instanceof Error ? error.message : "Não foi possível excluir a conta a receber.",
        variant: "destructive",
      });
    },
  });

  const rows = data?.data ?? [];
  const kpis = data?.kpis ?? { totalAReceber: 0, totalRecebido: 0, totalInadimplente: 0 };
  const openReceivableModal = (row: ReceivableRow, mode: "edit" | "installments") => {
    setEditingReceivable(row);
    setEditMode(mode);
  };
  const handleDeleteReceivable = (row: ReceivableRow) => {
    if (window.confirm(`Excluir a conta a receber de ${row.patientName}? Esta ação não pode ser desfeita.`)) {
      deleteReceivableMutation.mutate(row.id);
    }
  };
  const handleCancelReceivable = (row: ReceivableRow) => {
    if (window.confirm(`Cancelar a conta a receber de ${row.patientName}? O título permanecerá no histórico.`)) {
      updateStatusMutation.mutate({ id: row.id, status: "Cancelado" });
    }
  };
  return (
    <div className="app-container bg-slate-50">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />

      <div className="main-content">
        <Header title="Contas a Receber" onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 lg:p-6 flex-grow space-y-4">
          <Collapsible open={indicatorsOpen} onOpenChange={setIndicatorsOpen}>
            <div className="rounded-md border bg-white">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="h-10 w-full justify-between px-3" data-testid="toggle-receivables-indicators">
                  <span className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Indicadores</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${indicatorsOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Card data-testid="card-kpi-total-a-receber">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Total a Receber</p>
                    <p className="text-base font-semibold text-gray-900">{formatCurrency(kpis.totalAReceber)}</p>
                  </div>
                  <DollarSign className="h-5 w-5 text-primary/60" />
                </CardContent>
              </Card>
              <Card data-testid="card-kpi-total-recebido">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Total Recebido</p>
                    <p className="text-base font-semibold text-green-700">{formatCurrency(kpis.totalRecebido)}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-green-600/60" />
                </CardContent>
              </Card>
              <Card data-testid="card-kpi-inadimplente">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Total Inadimplente</p>
                    <p className="text-base font-semibold text-red-700">{formatCurrency(kpis.totalInadimplente)}</p>
                  </div>
                  <AlertTriangle className="h-5 w-5 text-red-600/60" />
                </CardContent>
              </Card>
            </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Filters */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <Card>
              <CardHeader className="p-0">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="h-10 w-full justify-between px-3" data-testid="toggle-receivables-filters">
                    <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Filtros</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="p-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Vencimento de</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="input-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Vencimento até</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    data-testid="input-end-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientSearch">Paciente</Label>
                  <Input
                    id="patientSearch"
                    placeholder="Buscar por nome..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    data-testid="input-patient-search"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ReceivableStatus | "Todos")}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Filtro de dentista executor — travado/omitido para o perfil DENTISTA */}
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>Dentista</Label>
                    <Select value={dentistId} onValueChange={setDentistId}>
                      <SelectTrigger data-testid="select-dentist">
                        <SelectValue placeholder="Todos os dentistas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Todos">Todos os dentistas</SelectItem>
                        {dentistOptions.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Títulos e Parcelas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Carregando títulos...</div>
              ) : isError ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-3">Não foi possível carregar os títulos.</p>
                  <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <HandCoins className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhum título encontrado para os filtros selecionados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {canManage && <TableHead className="w-[220px]">Ações</TableHead>}
                        <TableHead>Paciente</TableHead>
                        {isAdmin && <TableHead>Dentista</TableHead>}
                        <TableHead>Descrição</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id} data-testid={`receivable-${row.id}`}>
                          {canManage && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {row.status === "Vencido" && (() => {
                                  const hasValidPhone = !!normalizeBrazilianWhatsAppPhone(row.patientPhone);
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600 hover:text-green-700"
                                      onClick={() => setReminderReceivableId(row.id)}
                                      disabled={!hasValidPhone}
                                      title={hasValidPhone ? "Enviar lembrete por WhatsApp" : "Paciente sem celular válido para WhatsApp"}
                                      aria-label={hasValidPhone ? "Enviar lembrete por WhatsApp" : "Paciente sem celular válido para WhatsApp"}
                                      data-testid={`button-whatsapp-reminder-${row.id}`}
                                    >
                                      <SiWhatsapp className="h-4 w-4" />
                                    </Button>
                                  );
                                })()}
                                {row.status !== "Pago" && row.status !== "Cancelado" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-green-600 hover:text-green-700"
                                    onClick={() => updateStatusMutation.mutate({ id: row.id, status: "Pago" })}
                                    disabled={updateStatusMutation.isPending || deleteReceivableMutation.isPending}
                                    title="Dar baixa"
                                    aria-label="Dar baixa"
                                    data-testid={`button-pay-${row.id}`}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                )}
                                {row.status !== "Pago" && row.status !== "Cancelado" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600 hover:text-red-700"
                                    onClick={() => handleCancelReceivable(row)}
                                    disabled={updateStatusMutation.isPending || deleteReceivableMutation.isPending}
                                    title="Cancelar título"
                                    aria-label="Cancelar título"
                                    data-testid={`button-cancel-receivable-${row.id}`}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openReceivableModal(row, "edit")}
                                  disabled={updateStatusMutation.isPending || deleteReceivableMutation.isPending}
                                  title="Editar título"
                                  aria-label="Editar título"
                                  data-testid={`button-edit-receivable-${row.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openReceivableModal(row, "installments")}
                                  disabled={updateStatusMutation.isPending || deleteReceivableMutation.isPending}
                                  title="Gerar novas parcelas"
                                  aria-label="Gerar novas parcelas"
                                  data-testid={`button-new-installments-${row.id}`}
                                >
                                  <Layers3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700"
                                  onClick={() => handleDeleteReceivable(row)}
                                  disabled={updateStatusMutation.isPending || deleteReceivableMutation.isPending}
                                  title="Excluir título"
                                  aria-label="Excluir título"
                                  data-testid={`button-delete-receivable-${row.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="font-medium">{row.patientName}</TableCell>
                          {isAdmin && <TableCell>{row.dentistName}</TableCell>}
                          <TableCell>{row.descricao}</TableCell>
                          <TableCell>{row.numeroParcela}/{row.totalParcelas}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(parseFloat(row.valor))}</TableCell>
                          <TableCell>{formatDateBR(row.dataVencimento)}</TableCell>
                          <TableCell>{row.dataPagamento ? formatDateBR(row.dataPagamento) : "-"}</TableCell>
                          <TableCell><StatusBadge status={row.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
      <ReceivableEditModal
        isOpen={!!editingReceivable}
        mode={editMode}
        receivable={editingReceivable}
        onClose={() => setEditingReceivable(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: [url] })}
      />
      <ReceivableReminderDialog
        receivableId={reminderReceivableId}
        open={!!reminderReceivableId}
        onOpenChange={(open) => { if (!open) setReminderReceivableId(null); }}
        onSent={() => queryClient.invalidateQueries({ queryKey: [url] })}
      />
    </div>
  );
}
