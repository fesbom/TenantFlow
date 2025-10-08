import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/date-formatter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TreatmentModal from "@/components/modals/treatment-modal";
import BudgetItemModal from "@/components/modals/budget-item-modal";
import TreatmentMovementModal from "@/components/modals/treatment-movement-modal";
import AnamnesisModal from "@/components/modals/anamnesis-modal";
import BudgetDiscountModal from "@/components/modals/budget-discount-modal";
import { Patient, Treatment, BudgetItem, BudgetSummary, TreatmentMovement } from "@/types";
import { Search, Plus, FileText, Calendar, DollarSign, Activity, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface PaginatedPatientsResponse {
  data: Patient[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

const fetchData = async (url: string) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
  });
  if (!response.ok) {
    throw new Error('A resposta da rede não foi bem-sucedida');
  }
  return response.json();
};

export default function MedicalRecords() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTreatment, setSelectedTreatment] = useState<Treatment | null>(null);
  const [isTreatmentModalOpen, setIsTreatmentModalOpen] = useState(false);
  const [isBudgetItemModalOpen, setIsBudgetItemModalOpen] = useState(false);
  const [isTreatmentMovementModalOpen, setIsTreatmentMovementModalOpen] = useState(false);
  const [isAnamnesisModalOpen, setIsAnamnesisModalOpen] = useState(false);
  const [isBudgetDiscountModalOpen, setIsBudgetDiscountModalOpen] = useState(false);
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<BudgetItem | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<TreatmentMovement | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: patientsResponse, isLoading: patientsLoading, isError } = useQuery<PaginatedPatientsResponse>({
    queryKey: ["/api/patients", { page: currentPage, pageSize: 15, search: debouncedSearch }],
    queryFn: ({ queryKey }) => {
      const [_key, params] = queryKey as [string, { page: number; pageSize: number; search: string }];
      const searchParams = new URLSearchParams({ page: params.page.toString(), pageSize: params.pageSize.toString() });
      if (params.search) searchParams.append('search', params.search);
      return fetchData(`${_key}?${searchParams.toString()}`);
    },
  });

  const patients = patientsResponse?.data || [];
  const pagination = patientsResponse?.pagination;

  useEffect(() => {
    if (!patientsLoading && patients.length > 0) {
      const isSelectedInList = selectedPatient ? patients.some(p => p.id === selectedPatient.id) : false;
      if (!isSelectedInList) {
        setSelectedPatient(patients[0]);
      }
    } else if (!patientsLoading && patients.length === 0) {
      setSelectedPatient(null);
    }
  }, [patients, patientsLoading, selectedPatient]);

  useEffect(() => {
    setSelectedTreatment(null);
  }, [selectedPatient]);

  const { data: treatments = [], isLoading: treatmentsLoading } = useQuery<Treatment[]>({
    queryKey: ["/api/treatments/patient", selectedPatient?.id],
    queryFn: ({ queryKey }) => fetchData(`${queryKey[0]}/${queryKey[1]}`),
    enabled: !!selectedPatient,
  });

  const sortedTreatments = useMemo(() => {
    return [...treatments].sort((a, b) => {
      const aInProgress = a.situacaoTratamento === 'Em andamento';
      const bInProgress = b.situacaoTratamento === 'Em andamento';
      if (aInProgress && !bInProgress) return -1;
      if (!aInProgress && bInProgress) return 1;
      return new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime();
    });
  }, [treatments]);

  const { data: budgetItems = [] } = useQuery<BudgetItem[]>({
    queryKey: ["/api/budget-items/treatment", selectedTreatment?.id],
    queryFn: ({ queryKey }) => fetchData(`${queryKey[0]}/${queryKey[1]}`),
    enabled: !!selectedTreatment,
  });

  const { data: budgetSummary } = useQuery<BudgetSummary>({
    queryKey: ["/api/budget-summary/treatment", selectedTreatment?.id],
    queryFn: ({ queryKey }) => fetchData(`${queryKey[0]}/${queryKey[1]}`),
    enabled: !!selectedTreatment,
  });

  const { data: treatmentMovements = [] } = useQuery<TreatmentMovement[]>({
    queryKey: ["/api/treatment-movements/treatment", selectedTreatment?.id],
    queryFn: ({ queryKey }) => fetchData(`${queryKey[0]}/${queryKey[1]}`),
    enabled: !!selectedTreatment,
  });

  const { data: anamnesisData = [] } = useQuery<Array<{
    questionId: string; question: string; response?: string; createdAt?: string;
  }>>({
    queryKey: ["/api/anamnesis/treatment", selectedTreatment?.id],
    queryFn: ({ queryKey }) => fetchData(`${queryKey[0]}/${queryKey[1]}`),
    enabled: !!selectedTreatment,
  });

  const hasAnamnesisResponses = anamnesisData.some(item => item.response);

  const handleCreateTreatment = () => {
    if (!selectedPatient) return;
    setSelectedTreatment(null);
    setIsTreatmentModalOpen(true);
  };

  const handleEditTreatment = () => {
    if (!selectedPatient || !selectedTreatment) return;
    setIsTreatmentModalOpen(true);
  };

  const handleSelectTreatment = (treatment: Treatment) => {
    setSelectedTreatment(treatment);
  };

  const handleOpenAnamnesis = () => setIsAnamnesisModalOpen(true);
  const handleCreateBudgetItem = () => setIsBudgetItemModalOpen(true);
  const handleCreateMovement = () => {
    setSelectedMovement(null);
    setIsTreatmentMovementModalOpen(true);
  };
  const handleEditMovement = (movement: TreatmentMovement) => {
    setSelectedMovement(movement);
    setIsTreatmentMovementModalOpen(true);
  };


  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "Em andamento": "default", "Concluído": "secondary", "Cancelado": "destructive"
    };
    return (<Badge variant={variants[status] || "outline"}>{status}</Badge>);
  };

  const formatCurrency = (value: string | number) => {
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    return `R$ ${numericValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="app-container bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isExpanded={sidebarExpanded} onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)} />
      <div className="main-content">
        <Header title="Prontuários" onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 lg:p-6 flex-grow">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle>Pacientes</CardTitle>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input placeholder="Buscar pacientes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                </CardHeader>
                <CardContent className="max-h-[60vh] overflow-y-auto">
                  {patientsLoading ? (
                    <div className="text-center text-gray-500 py-8">Carregando...</div>
                  ) : isError ? (
                    <div className="text-center text-red-500 py-8">Erro ao carregar pacientes.</div>
                  ) : patients.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">{debouncedSearch ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}</div>
                  ) : (
                    <div className="space-y-2">
                      {patients.map((patient) => (
                        <div key={patient.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedPatient?.id === patient.id ? "bg-primary/10 border-primary" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`} onClick={() => setSelectedPatient(patient)}>
                          <div className="font-medium text-sm">{patient.fullName}</div>
                          <div className="text-xs text-gray-500">{patient.phone}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="text-xs text-gray-600">Página {pagination.page} de {pagination.totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))} disabled={currentPage === pagination.totalPages}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                )}
              </Card>
            </div>
            <div className="lg:col-span-3">
              {selectedPatient ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Tratamentos</CardTitle>
                      <Button size="sm" onClick={handleCreateTreatment}><Plus className="h-4 w-4 mr-1" />Novo</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[calc(60vh+80px)] overflow-y-auto">
                    {treatmentsLoading ? (
                      <div className="text-center py-8">Carregando tratamentos...</div>
                    ) : sortedTreatments.length > 0 ? (
                      <div className="space-y-3">
                        {sortedTreatments.map((treatment) => (
                          <div key={treatment.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTreatment?.id === treatment.id ? "bg-primary/10 border-primary" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`} onClick={() => handleSelectTreatment(treatment)}>
                            <div className="font-medium text-sm mb-1">{treatment.tituloTratamento}</div>
                            <div className="text-xs text-gray-500 mb-2">Início: {formatDateBR(treatment.dataInicio)}</div>
                            {getStatusBadge(treatment.situacaoTratamento)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Nenhum tratamento encontrado</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={handleCreateTreatment}>Criar primeiro tratamento</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="h-full"><CardContent className="flex items-center justify-center h-full"><div className="text-center text-gray-500"><FileText className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>Selecione um paciente para ver os tratamentos</p></div></CardContent></Card>
              )}
            </div>
            <div className="lg:col-span-6">
              {selectedTreatment ? (
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>{selectedTreatment.tituloTratamento}</CardTitle>
                      <Button variant="outline" size="sm" onClick={handleEditTreatment}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar Tratamento
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="overview"><FileText className="h-4 w-4 mr-1" />Visão Geral</TabsTrigger>
                        <TabsTrigger value="anamnesis"><Calendar className="h-4 w-4 mr-1" />Anamnese</TabsTrigger>
                        <TabsTrigger value="budget"><DollarSign className="h-4 w-4 mr-1" />Orçamento</TabsTrigger>
                        <TabsTrigger value="movements"><Activity className="h-4 w-4 mr-1" />Movimentação</TabsTrigger>
                      </TabsList>

                      <TabsContent value="overview" className="mt-4">
                         <div className="space-y-2">
                           <div><span className="font-semibold">Início:</span> {formatDateBR(selectedTreatment.dataInicio)}</div>
                           <div><span className="font-semibold">Status:</span> {getStatusBadge(selectedTreatment.situacaoTratamento)}</div>
                         </div>
                      </TabsContent>

                      <TabsContent value="anamnesis" className="mt-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium">Questionário</h3>
                            <Button size="sm" onClick={handleOpenAnamnesis}>
                                <Plus className="h-4 w-4 mr-1" />
                                {hasAnamnesisResponses ? "Editar" : "Preencher"}
                            </Button>
                        </div>
                        {hasAnamnesisResponses ? (
                            <div className="space-y-3">
                                {anamnesisData.map((item) => (
                                    <div key={item.questionId} className="text-sm">
                                        <p className="font-semibold">{item.question}</p>
                                        <p>{item.response || "Não respondido"}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (<p className="text-sm text-gray-500">Anamnese não preenchida.</p>)}
                      </TabsContent>

                      <TabsContent value="budget" className="mt-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium">Itens do Orçamento</h3>
                            <Button size="sm" onClick={handleCreateBudgetItem}><Plus className="h-4 w-4 mr-1" /> Adicionar Item</Button>
                          </div>
                          {budgetItems.length > 0 ? (<>
                            <Table>
                                <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {budgetItems.map(item => (
                                        <TableRow key={item.id}><TableCell>{item.descricaoOrcamento}</TableCell><TableCell className="text-right">{formatCurrency(item.valorOrcamento)}</TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {budgetSummary && (
                                <div className="mt-4 pt-4 border-t text-right">
                                    <p><span className="font-semibold">Subtotal:</span> {formatCurrency(budgetSummary.subtotalOrcamento)}</p>
                                    <p><span className="font-semibold">Desconto:</span> -{formatCurrency(budgetSummary.descontoOrcamento)}</p>
                                    <p className="text-lg font-bold"><span className="font-semibold">Total:</span> {formatCurrency(budgetSummary.totalOrcamento)}</p>
                                </div>
                            )}
                          </>) : (<p className="text-sm text-gray-500">Nenhum item no orçamento.</p>)}
                      </TabsContent>

                      <TabsContent value="movements" className="mt-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium">Movimentações</h3>
                            <Button size="sm" onClick={handleCreateMovement}><Plus className="h-4 w-4 mr-1" /> Nova Movimentação</Button>
                          </div>
                          {treatmentMovements.length > 0 ? (
                            <Table>
                                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Região</TableHead><TableHead>Dente</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {treatmentMovements.map(mov => (
                                        <TableRow key={mov.id} data-testid={`row-movement-${mov.id}`} onClick={() => handleEditMovement(mov)} className="cursor-pointer hover:bg-gray-50"><TableCell>{formatDateBR(mov.dataMovimentacao)}</TableCell><TableCell>{mov.descricaoAtividade}</TableCell><TableCell>{mov.region || "-"}</TableCell><TableCell>{mov.toothNumber || "-"}</TableCell><TableCell className="text-right">{formatCurrency(mov.valorServico)}</TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                          ) : (<p className="text-sm text-gray-500">Nenhuma movimentação registrada.</p>)}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ) : (
                <Card className="h-full"><CardContent className="flex items-center justify-center h-full"><div className="text-center text-gray-500"><FileText className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>Selecione um tratamento para ver os detalhes</p></div></CardContent></Card>
              )}
            </div>
          </div>
        </main>
      </div>
      <TreatmentModal isOpen={isTreatmentModalOpen} onClose={() => setIsTreatmentModalOpen(false)} patient={selectedPatient} treatment={selectedTreatment} />
      <BudgetItemModal isOpen={isBudgetItemModalOpen} onClose={() => setIsBudgetItemModalOpen(false)} treatment={selectedTreatment} budgetItem={selectedBudgetItem} />
      <TreatmentMovementModal isOpen={isTreatmentMovementModalOpen} onClose={() => setIsTreatmentMovementModalOpen(false)} treatment={selectedTreatment} movement={selectedMovement} />
      <AnamnesisModal isOpen={isAnamnesisModalOpen} onClose={() => setIsAnamnesisModalOpen(false)} treatment={selectedTreatment} />
      <BudgetDiscountModal isOpen={isBudgetDiscountModalOpen} onClose={() => setIsBudgetDiscountModalOpen(false)} treatment={selectedTreatment} budgetSummary={budgetSummary || null} />
    </div>
  );
}