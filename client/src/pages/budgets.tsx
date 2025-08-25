import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Budget, Patient } from "@/types";
import { Search, Plus, DollarSign, Edit, Trash2, Eye } from "lucide-react";

export default function Budgets() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    patientId: "",
    title: "",
    procedures: "",
    totalCost: "",
    validUntil: "",
    notes: "",
  });

  // Fetch budgets
  const { data: budgets = [], isLoading } = useQuery<Budget[]>({
    queryKey: ["/api/budgets"],
  });

  // Fetch patients for selection
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  // Create budget mutation
  const createBudgetMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/budgets", {
        ...data,
        procedures: JSON.stringify([{ name: data.procedures, cost: data.totalCost }]),
        totalCost: data.totalCost,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({
        title: "Orçamento criado",
        description: "Orçamento criado com sucesso",
      });
      resetForm();
      setIsModalOpen(false);
    },
    onError: () => {
      toast({
        title: "Erro ao criar orçamento",
        description: "Não foi possível criar o orçamento",
        variant: "destructive",
      });
    },
  });

  // Update budget status mutation
  const updateBudgetMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/budgets/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({
        title: "Orçamento atualizado",
        description: "Status do orçamento atualizado com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar orçamento",
        description: "Não foi possível atualizar o orçamento",
        variant: "destructive",
      });
    },
  });

  // Delete budget mutation
  const deleteBudgetMutation = useMutation({
    mutationFn: async (budgetId: string) => {
      await apiRequest("DELETE", `/api/budgets/${budgetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({
        title: "Orçamento removido",
        description: "Orçamento removido com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao remover orçamento",
        description: "Não foi possível remover o orçamento",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      patientId: "",
      title: "",
      procedures: "",
      totalCost: "",
      validUntil: "",
      notes: "",
    });
    setSelectedBudget(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createBudgetMutation.mutate(formData);
  };

  const handleDelete = async (budgetId: string) => {
    if (window.confirm("Tem certeza que deseja remover este orçamento?")) {
      deleteBudgetMutation.mutate(budgetId);
    }
  };

  const handleStatusChange = (budgetId: string, status: string) => {
    updateBudgetMutation.mutate({ id: budgetId, status });
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.fullName : `Paciente #${patientId.slice(-6)}`;
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      pending: { label: "Pendente", variant: "outline" as const },
      approved: { label: "Aprovado", variant: "default" as const },
      rejected: { label: "Rejeitado", variant: "destructive" as const },
    };

    const config = statusMap[status as keyof typeof statusMap] || statusMap.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatCurrency = (value: string) => {
    return `R$ ${parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const filteredBudgets = budgets.filter(budget => {
    const patientName = getPatientName(budget.patientId).toLowerCase();
    const title = budget.title.toLowerCase();
    const search = searchTerm.toLowerCase();
    return patientName.includes(search) || title.includes(search);
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      
      <div 
        className={`flex-1 w-full ${
          sidebarExpanded ? "main-content-expanded" : "main-content-collapsed"
        }`}
        data-sidebar-state={sidebarExpanded ? "expanded" : "collapsed"}
        style={{
          marginLeft: sidebarExpanded ? '256px' : '80px',
          transition: 'margin-left 0.3s ease-in-out'
        }}
      >
        <Header title="Orçamentos" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6 w-full max-w-none">
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar orçamentos por paciente ou título..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-budgets"
              />
            </div>
            
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => resetForm()} data-testid="button-new-budget">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Orçamento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Criar Novo Orçamento</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="patientId">Paciente *</Label>
                      <Select
                        value={formData.patientId}
                        onValueChange={(value) => setFormData({ ...formData, patientId: value })}
                        required
                      >
                        <SelectTrigger data-testid="select-patient">
                          <SelectValue placeholder="Selecione um paciente" />
                        </SelectTrigger>
                        <SelectContent>
                          {patients.map((patient) => (
                            <SelectItem key={patient.id} value={patient.id}>
                              {patient.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="title">Título do Orçamento *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Ex: Tratamento de Canal"
                        required
                        data-testid="input-budget-title"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="procedures">Procedimentos *</Label>
                      <Textarea
                        id="procedures"
                        value={formData.procedures}
                        onChange={(e) => setFormData({ ...formData, procedures: e.target.value })}
                        placeholder="Descreva os procedimentos incluídos no orçamento"
                        rows={3}
                        required
                        data-testid="textarea-procedures"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="totalCost">Valor Total *</Label>
                      <Input
                        id="totalCost"
                        type="number"
                        step="0.01"
                        value={formData.totalCost}
                        onChange={(e) => setFormData({ ...formData, totalCost: e.target.value })}
                        placeholder="0.00"
                        required
                        data-testid="input-total-cost"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="validUntil">Válido até</Label>
                      <Input
                        id="validUntil"
                        type="date"
                        value={formData.validUntil}
                        onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                        data-testid="input-valid-until"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Observações adicionais sobre o orçamento"
                        rows={3}
                        data-testid="textarea-notes"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsModalOpen(false)}
                      data-testid="button-cancel-budget"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createBudgetMutation.isPending}
                      data-testid="button-save-budget"
                    >
                      {createBudgetMutation.isPending ? "Salvando..." : "Criar Orçamento"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Budgets Table */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Orçamentos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Carregando orçamentos...</div>
              ) : filteredBudgets.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>{searchTerm ? "Nenhum orçamento encontrado" : "Nenhum orçamento criado"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Válido até</TableHead>
                        <TableHead>Criado em</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBudgets.map((budget) => (
                        <TableRow key={budget.id} data-testid={`budget-${budget.id}`}>
                          <TableCell>
                            <div className="font-medium">{getPatientName(budget.patientId)}</div>
                          </TableCell>
                          <TableCell>{budget.title}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(budget.totalCost)}
                          </TableCell>
                          <TableCell>{getStatusBadge(budget.status)}</TableCell>
                          <TableCell>
                            {budget.validUntil ? formatDate(budget.validUntil) : "-"}
                          </TableCell>
                          <TableCell>{formatDate(budget.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {budget.status === "pending" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStatusChange(budget.id, "approved")}
                                    className="text-green-600 hover:text-green-700"
                                    data-testid={`button-approve-${budget.id}`}
                                  >
                                    Aprovar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStatusChange(budget.id, "rejected")}
                                    className="text-red-600 hover:text-red-700"
                                    data-testid={`button-reject-${budget.id}`}
                                  >
                                    Rejeitar
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(budget.id)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-delete-${budget.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
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
    </div>
  );
}
