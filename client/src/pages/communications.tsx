import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MessageSquarePlus, Pencil, Plus, Send, Trash2, Users, X } from "lucide-react";
import { isValidWhatsappPhone } from "@shared/phone";

const variables = ["{nome}", "{primeiro_nome}", "{clinica}"] as const;
type TriggerType = "birthday" | "inactivity_6m" | "treatment_completed" | "manual";
interface Reason { id: string; name: string; triggerType: TriggerType; messageTemplate: string; isActive: boolean; sendMode: "automatic" | "manual"; isSystemDefault: boolean; deletedAt: string | null }
interface AudiencePatient { id: string; fullName: string; phone: string; birthDate: string | null; city: string | null; neighborhood: string | null; sex: string | null }
interface CommunicationLog { id: string; patientId: string; patientName: string; reasonName: string | null; category: string; origin: "automatic" | "manual"; messageSent: string; status: string; sentAt: string | null; createdAt: string; error: string | null; appointmentScheduledDate: string | null }
const triggerLabels: Record<TriggerType, string> = { birthday: "Aniversário", inactivity_6m: "Retorno preventivo (6 meses)", treatment_completed: "Avaliação pós-tratamento", manual: "Manual" };
const categoryLabels: Record<string, string> = {
  birthday: "Aniversariantes",
  inactivity_6m: "Contato de retorno",
  treatment_completed: "Avaliação pós-tratamento",
  appointment_confirmation: "Confirmação de agendamento",
  manual: "Mensagem livre",
};

function formatDate(value: string | null): string { return value ? new Date(value).toLocaleString("pt-BR") : "—"; }
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { sent: "bg-green-100 text-green-800", simulated: "bg-blue-100 text-blue-800", pending: "bg-amber-100 text-amber-800", failed: "bg-red-100 text-red-800" };
  return <Badge className={colors[status] ?? "bg-gray-100 text-gray-800"}>{status}</Badge>;
}

export default function Communications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<Reason | null>(null);
  const [reasonForm, setReasonForm] = useState({ name: "", triggerType: "manual" as TriggerType,   messageTemplate: "", isActive: true, sendMode: "manual" as "automatic" | "manual" });
  const [search, setSearch] = useState({ name: "", city: "", neighborhood: "", sex: "", minAge: "", maxAge: "" });
  const [appliedSearch, setAppliedSearch] = useState(search);
  const [selectedPatients, setSelectedPatients] = useState<Record<string, AudiencePatient>>({});
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [delaySeconds, setDelaySeconds] = useState("2");
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({ startDate: "", endDate: "", patientName: "", reasonId: "", status: "" });

  const { data: reasons = [] } = useQuery<Reason[]>({ queryKey: ["/api/communications/reasons"] });
  const activeReasons = useMemo(() => reasons.filter((reason) => reason.isActive && !reason.deletedAt), [reasons]);
  const audienceUrl = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(appliedSearch).forEach(([key, value]) => { if (value) params.set(key, value); });
    return `/api/communications/patients?${params}`;
  }, [appliedSearch]);
  const { data: audience = [], isFetching: audienceLoading } = useQuery<AudiencePatient[]>({ queryKey: [audienceUrl] });
  const logsUrl = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(historyFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return `/api/communications/logs?${params}`;
  }, [historyFilters]);
  const { data: logs = [] } = useQuery<CommunicationLog[]>({ queryKey: [logsUrl] });

  const reasonMutation = useMutation({
    mutationFn: async () => {
      const payload = reasonForm;
      const response = editingReason
        ? await apiRequest("PATCH", `/api/communications/reasons/${editingReason.id}`, payload)
        : await apiRequest("POST", "/api/communications/reasons", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/reasons"] });
      setReasonDialogOpen(false);
      toast({ title: editingReason ? "Motivo atualizado" : "Motivo criado" });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar o motivo", description: error.message, variant: "destructive" }),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/communications/reasons/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/communications/reasons"] }); toast({ title: "Motivo removido ou arquivado" }); },
    onError: (error: Error) => toast({ title: "Não foi possível remover o motivo", description: error.message, variant: "destructive" }),
  });
  const toggleReasonMutation = useMutation({
    mutationFn: ({ id, isActive }: Pick<Reason, "id" | "isActive">) => apiRequest("PATCH", `/api/communications/reasons/${id}`, { isActive: !isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/communications/reasons"] }),
    onError: (error: Error) => toast({ title: "Não foi possível alterar o status", description: error.message, variant: "destructive" }),
  });
  const toggleSendModeMutation = useMutation({
    mutationFn: ({ id, sendMode }: Pick<Reason, "id" | "sendMode">) => apiRequest("PATCH", `/api/communications/reasons/${id}`, { sendMode: sendMode === "automatic" ? "manual" : "automatic" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/communications/reasons"] }),
    onError: (error: Error) => toast({ title: "Não foi possível alterar o modo de envio", description: error.message, variant: "destructive" }),
  });
  const { data: automation } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/communications/automation"] });
  const automationMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("PUT", "/api/communications/automation", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/communications/automation"] }),
    onError: (error: Error) => toast({ title: "Não foi possível alterar o envio automático", description: error.message, variant: "destructive" }),
  });
  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/communications/dispatch", {
        patientIds: Object.keys(selectedPatients), reasonId: selectedReasonId || null, message, delaySeconds: Number(delaySeconds),
      });
      return response.json() as Promise<{ results: Array<{ status: string; error?: string }> }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/logs"] });
      setDispatchConfirmOpen(false);
      const failedResults = result.results.filter((item) => item.status === "failed");
      const skippedResults = result.results.filter((item) => item.status === "skipped");
      const sentCount = result.results.length - failedResults.length - skippedResults.length;
      const failureReason = failedResults.find((item) => item.error)?.error;
      toast({
        title: "Envio concluído",
        description: `${sentCount} enviado(s), ${failedResults.length} falha(s), ${skippedResults.length} ignorado(s) (sem WhatsApp válido ou já enviado).${failureReason ? ` Motivo: ${failureReason}` : ""}`,
        variant: failedResults.length > 0 ? "destructive" : "default",
      });
    },
    onError: (error: Error) => toast({ title: "Falha no envio", description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    const selected = activeReasons.find((reason) => reason.id === selectedReasonId);
    if (selected) setMessage(selected.messageTemplate);
  }, [selectedReasonId]);

  const openNewReason = () => { setEditingReason(null); setReasonForm({ name: "", triggerType: "manual", messageTemplate: "", isActive: true, sendMode: "manual" }); setReasonDialogOpen(true); };
  const openEditReason = (reason: Reason) => { setEditingReason(reason); setReasonForm({ name: reason.name, triggerType: reason.triggerType, messageTemplate: reason.messageTemplate, isActive: reason.isActive, sendMode: reason.sendMode }); setReasonDialogOpen(true); };
  const togglePatient = (patient: AudiencePatient) => setSelectedPatients((current) => {
    const next = { ...current }; if (next[patient.id]) delete next[patient.id]; else next[patient.id] = patient; return next;
  });
  const appendVariable = (variable: string) => setReasonForm((current) => ({ ...current, messageTemplate: `${current.messageTemplate}${variable}` }));
  const appendMessageVariable = (variable: string) => setMessage((current) => `${current}${variable}`);

  return <div className="app-container bg-slate-50">
    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isExpanded={sidebarExpanded} onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)} />
    <div className="main-content"><Header title="Comunicação Ativa" onMenuClick={() => setSidebarOpen(true)} />
      <main className="p-4 lg:p-6"><Tabs defaultValue="manual" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="manual">Nova mensagem</TabsTrigger><TabsTrigger value="history">Histórico de contatos</TabsTrigger><TabsTrigger value="reasons">Gerenciar motivos</TabsTrigger></TabsList>
        <TabsContent value="manual" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Buscar pacientes</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3"><Input placeholder="Nome" value={search.name} onChange={(e) => setSearch({ ...search, name: e.target.value })} /><Input placeholder="Cidade" value={search.city} onChange={(e) => setSearch({ ...search, city: e.target.value })} /><Input placeholder="Bairro" value={search.neighborhood} onChange={(e) => setSearch({ ...search, neighborhood: e.target.value })} /><Select value={search.sex || "all"} onValueChange={(sex) => setSearch({ ...search, sex: sex === "all" ? "" : sex })}><SelectTrigger><SelectValue placeholder="Sexo" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os sexos</SelectItem><SelectItem value="F">Feminino</SelectItem><SelectItem value="M">Masculino</SelectItem></SelectContent></Select><Input type="number" min="0" placeholder="Idade mínima" value={search.minAge} onChange={(e) => setSearch({ ...search, minAge: e.target.value })} /><Input type="number" min="0" placeholder="Idade máxima" value={search.maxAge} onChange={(e) => setSearch({ ...search, maxAge: e.target.value })} /></div>
            <Button variant="outline" onClick={() => setAppliedSearch(search)} disabled={audienceLoading}>Buscar</Button>
            <div className="max-h-96 overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Selecionar</TableHead><TableHead>Paciente</TableHead><TableHead>Telefone</TableHead><TableHead>Localidade</TableHead></TableRow></TableHeader><TableBody>{audience.map((patient) => <TableRow key={patient.id}><TableCell><input aria-label={`Selecionar ${patient.fullName}`} type="checkbox" disabled={!isValidWhatsappPhone(patient.phone)} checked={!!selectedPatients[patient.id]} onChange={() => togglePatient(patient)} /></TableCell><TableCell>{patient.fullName}</TableCell><TableCell>{patient.phone}{!isValidWhatsappPhone(patient.phone) && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700">Sem WhatsApp</Badge>}</TableCell><TableCell>{[patient.city, patient.neighborhood].filter(Boolean).join(" / ") || "—"}</TableCell></TableRow>)}{!audienceLoading && audience.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum paciente encontrado.</TableCell></TableRow>}</TableBody></Table></div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Destinatários ({Object.keys(selectedPatients).length})</CardTitle></CardHeader><CardContent><div className="max-h-[430px] space-y-2 overflow-auto">{Object.values(selectedPatients).map((patient) => <div key={patient.id} className="flex items-center justify-between rounded border p-2 text-sm"><span className="min-w-0 truncate">{patient.fullName}</span><Button size="icon" variant="ghost" aria-label={`Remover ${patient.fullName}`} onClick={() => togglePatient(patient)}><X className="h-4 w-4" /></Button></div>)}{Object.keys(selectedPatients).length === 0 && <p className="text-sm text-muted-foreground">Selecione pacientes na busca. Sua seleção será mantida ao refazer os filtros.</p>}</div></CardContent></Card></div>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquarePlus className="h-5 w-5" />Mensagem</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div><Label>Motivo</Label><Select value={selectedReasonId || "free"} onValueChange={(value) => setSelectedReasonId(value === "free" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="free">Mensagem livre</SelectItem>{activeReasons.map((reason) => <SelectItem key={reason.id} value={reason.id}>{reason.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Intervalo entre mensagens</Label><Select value={delaySeconds} onValueChange={setDelaySeconds}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2">2 segundos</SelectItem><SelectItem value="3">3 segundos</SelectItem><SelectItem value="4">4 segundos</SelectItem><SelectItem value="5">5 segundos</SelectItem></SelectContent></Select></div></div><div className="flex flex-wrap gap-2">{variables.map((variable) => <Button key={variable} type="button" variant="outline" size="sm" onClick={() => appendMessageVariable(variable)}>{variable}</Button>)}</div><Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escreva a mensagem que será enviada." /><Button className="gap-2" disabled={!message.trim() || Object.keys(selectedPatients).length === 0} onClick={() => setDispatchConfirmOpen(true)}><Send className="h-4 w-4" />Enviar para {Object.keys(selectedPatients).length} paciente(s)</Button></CardContent></Card>
        </TabsContent>
        <TabsContent value="history"><Card><CardHeader><CardTitle>Histórico de contatos</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-5"><Input type="date" value={historyFilters.startDate} onChange={(e) => setHistoryFilters({ ...historyFilters, startDate: e.target.value })} /><Input type="date" value={historyFilters.endDate} onChange={(e) => setHistoryFilters({ ...historyFilters, endDate: e.target.value })} /><Input placeholder="Paciente" value={historyFilters.patientName} onChange={(e) => setHistoryFilters({ ...historyFilters, patientName: e.target.value })} /><Select value={historyFilters.reasonId || "all"} onValueChange={(reasonId) => setHistoryFilters({ ...historyFilters, reasonId: reasonId === "all" ? "" : reasonId })}><SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os motivos</SelectItem>{reasons.map((reason) => <SelectItem key={reason.id} value={reason.id}>{reason.name}</SelectItem>)}</SelectContent></Select><Select value={historyFilters.status || "all"} onValueChange={(status) => setHistoryFilters({ ...historyFilters, status: status === "all" ? "" : status })}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="sent">Enviado</SelectItem><SelectItem value="simulated">Simulado</SelectItem><SelectItem value="failed">Falhou</SelectItem></SelectContent></Select></div><div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Paciente</TableHead><TableHead>Serviço</TableHead><TableHead>Origem</TableHead><TableHead>Mensagem</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell>{formatDate(log.sentAt ?? log.createdAt)}</TableCell><TableCell>{log.patientName}</TableCell><TableCell><div>{categoryLabels[log.category] ?? log.reasonName ?? "Mensagem livre"}</div>{log.appointmentScheduledDate && <p className="text-xs text-muted-foreground">Agenda: {formatDate(log.appointmentScheduledDate)}</p>}</TableCell><TableCell><Badge variant={log.origin === "automatic" ? "secondary" : "outline"}>{log.origin === "automatic" ? "Automático" : "Manual"}</Badge></TableCell><TableCell className="max-w-md truncate" title={log.messageSent}>{log.messageSent}</TableCell><TableCell><div className="space-y-1"><StatusBadge status={log.status} />{log.error && <p className="max-w-xs text-xs text-red-700" title={log.error}>{log.error}</p>}</div></TableCell></TableRow>)}{logs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum disparo encontrado.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></TabsContent>
        <TabsContent value="reasons"><Card className="mb-4"><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6"><div><div className="font-medium">Envio automático de mensagens</div><p className="text-sm text-muted-foreground">Quando desabilitado, nenhuma mensagem é enviada automaticamente (aniversário, retorno, pós-tratamento). Quando habilitado, só são enviados os motivos ativos configurados como "Automático".</p></div><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={automation?.enabled ?? false} disabled={automationMutation.isPending} onChange={(e) => automationMutation.mutate(e.target.checked)} />{automation?.enabled ? "Habilitado" : "Desabilitado"}</label></CardContent></Card><Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Motivos e templates</CardTitle><Button className="gap-2" onClick={openNewReason}><Plus className="h-4 w-4" />Novo motivo</Button></CardHeader><CardContent><div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Gatilho</TableHead><TableHead>Status</TableHead><TableHead>Envio</TableHead><TableHead>Mensagem</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{reasons.map((reason) => <TableRow key={reason.id}><TableCell>{reason.name}{reason.isSystemDefault && <Badge variant="outline" className="ml-2">Sistema</Badge>}</TableCell><TableCell>{triggerLabels[reason.triggerType]}</TableCell><TableCell><Badge variant={reason.isActive ? "default" : "secondary"}>{reason.isActive ? "Ativo" : "Inativo"}</Badge></TableCell><TableCell>{reason.triggerType === "manual" ? "—" : <Button size="sm" variant="outline" onClick={() => toggleSendModeMutation.mutate(reason)}>{reason.sendMode === "automatic" ? "Automático" : "Manual"}</Button>}</TableCell><TableCell className="max-w-md truncate">{reason.messageTemplate}</TableCell><TableCell className="space-x-1 text-right"><Button size="sm" variant="outline" onClick={() => toggleReasonMutation.mutate(reason)}>{reason.isActive ? "Desativar" : "Ativar"}</Button><Button size="icon" variant="ghost" aria-label={`Editar ${reason.name}`} onClick={() => openEditReason(reason)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Excluir ${reason.name}`} onClick={() => archiveMutation.mutate(reason.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell></TableRow>)}{reasons.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum motivo cadastrado.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></TabsContent>
      </Tabs></main></div>
      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editingReason ? "Editar motivo" : "Novo motivo"}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Nome</Label><Input value={reasonForm.name} onChange={(e) => setReasonForm({ ...reasonForm, name: e.target.value })} /></div><div><Label>Gatilho</Label><Select value={reasonForm.triggerType} disabled={!!editingReason?.isSystemDefault} onValueChange={(triggerType: TriggerType) => setReasonForm({ ...reasonForm, triggerType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(triggerLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="flex flex-wrap gap-2">{variables.map((variable) => <Button key={variable} type="button" variant="outline" size="sm" onClick={() => appendVariable(variable)}>{variable}</Button>)}</div><div><Label>Mensagem</Label><Textarea rows={6} value={reasonForm.messageTemplate} onChange={(e) => setReasonForm({ ...reasonForm, messageTemplate: e.target.value })} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reasonForm.isActive} onChange={(e) => setReasonForm({ ...reasonForm, isActive: e.target.checked })} />Motivo ativo</label></div><DialogFooter><Button variant="outline" onClick={() => setReasonDialogOpen(false)}>Cancelar</Button><Button disabled={reasonMutation.isPending} onClick={() => reasonMutation.mutate()}>Salvar</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={dispatchConfirmOpen} onOpenChange={setDispatchConfirmOpen}><DialogContent><DialogHeader><DialogTitle>Confirmar envio em lote</DialogTitle></DialogHeader><p>Enviar esta mensagem para <strong>{Object.keys(selectedPatients).length}</strong> paciente(s), com intervalo de {delaySeconds} segundos?</p><DialogFooter><Button variant="outline" onClick={() => setDispatchConfirmOpen(false)}>Cancelar</Button><Button disabled={dispatchMutation.isPending} onClick={() => dispatchMutation.mutate()}>{dispatchMutation.isPending ? "Enviando..." : "Confirmar envio"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
