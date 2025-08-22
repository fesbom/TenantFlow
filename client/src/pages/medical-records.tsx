import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Patient, Treatment, BudgetItem, BudgetSummary, TreatmentMovement, AnamnesisResponse } from "@/types";
import { Search, Plus, FileText, Calendar, DollarSign, Activity, Edit } from "lucide-react";

export default function MedicalRecords() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTreatment, setSelectedTreatment] = useState<Treatment | null>(null);
  const [isTreatmentModalOpen, setIsTreatmentModalOpen] = useState(false);
  const [isBudgetItemModalOpen, setIsBudgetItemModalOpen] = useState(false);
  const [isTreatmentMovementModalOpen, setIsTreatmentMovementModalOpen] = useState(false);
  const [isAnamnesisModalOpen, setIsAnamnesisModalOpen] = useState(false);
  const [isBudgetDiscountModalOpen, setIsBudgetDiscountModalOpen] = useState(false);
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<BudgetItem | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<TreatmentMovement | null>(null);

  // Fetch patients
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  // Fetch treatments for selected patient
  const { data: treatments = [], isLoading: treatmentsLoading } = useQuery<Treatment[]>({
    queryKey: ["/api/treatments/patient", selectedPatient?.id],
    enabled: !!selectedPatient,
  });

  // Fetch budget items for selected treatment
  const { data: budgetItems = [] } = useQuery<BudgetItem[]>({
    queryKey: ["/api/budget-items/treatment", selectedTreatment?.id],
    enabled: !!selectedTreatment,
  });

  // Fetch budget summary for selected treatment
  const { data: budgetSummary } = useQuery<BudgetSummary>({
    queryKey: ["/api/budget-summary/treatment", selectedTreatment?.id],
    enabled: !!selectedTreatment,
  });

  // Fetch treatment movements for selected treatment
  const { data: treatmentMovements = [] } = useQuery<TreatmentMovement[]>({
    queryKey: ["/api/treatment-movements/treatment", selectedTreatment?.id],
    enabled: !!selectedTreatment,
  });

  // Fetch anamnesis responses
  const { data: anamnesisResponses = [] } = useQuery<AnamnesisResponse[]>({
    queryKey: ["/api/anamnesis/responses/treatment", selectedTreatment?.id],
    enabled: !!selectedTreatment,
  });

  const filteredPatients = patients.filter(patient =>
    patient.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone.includes(searchTerm)
  );

  const handleCreateTreatment = (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedTreatment(null);
    setIsTreatmentModalOpen(true);
  };

  const handleSelectTreatment = (treatment: Treatment) => {
    setSelectedTreatment(treatment);
  };

  const handleCreateBudgetItem = () => {
    setSelectedBudgetItem(null);
    setIsBudgetItemModalOpen(true);
  };

  const handleEditBudgetItem = (item: BudgetItem) => {
    setSelectedBudgetItem(item);
    setIsBudgetItemModalOpen(true);
  };

  const handleCreateMovement = () => {
    setSelectedMovement(null);
    setIsTreatmentMovementModalOpen(true);
  };

  const handleEditMovement = (movement: TreatmentMovement) => {
    setSelectedMovement(movement);
    setIsTreatmentMovementModalOpen(true);
  };

  const handleOpenAnamnesis = () => {
    setIsAnamnesisModalOpen(true);
  };

  const handleEditDiscount = () => {
    setIsBudgetDiscountModalOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: string | number) => {
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    return `R$ ${numericValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "Em andamento": "default",
      "Concluído": "secondary",
      "Cancelado": "destructive"
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="lg:pl-64">
        <Header title="Prontuários" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Patients List */}
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle>Pacientes</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Buscar pacientes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-patients"
                    />
                  </div>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {filteredPatients.map((patient) => (
                      <div
                        key={patient.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedPatient?.id === patient.id
                            ? "bg-primary/10 border-primary"
                            : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                        }`}
                        onClick={() => setSelectedPatient(patient)}
                        data-testid={`patient-${patient.id}`}
                      >
                        <div className="font-medium text-sm">{patient.fullName}</div>
                        <div className="text-xs text-gray-500">{patient.phone}</div>
                      </div>
                    ))}
                    {filteredPatients.length === 0 && (
                      <div className="text-center text-gray-500 py-8">
                        {searchTerm ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Treatments List */}
            <div className="lg:col-span-3">
              {selectedPatient ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Tratamentos</CardTitle>
                      <Button 
                        size="sm" 
                        onClick={() => handleCreateTreatment(selectedPatient)}
                        data-testid="button-create-treatment"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Novo
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto">
                    {treatmentsLoading ? (
                      <div className="text-center py-8">Carregando...</div>
                    ) : treatments.length > 0 ? (
                      <div className="space-y-3">
                        {treatments.map((treatment) => (
                          <div
                            key={treatment.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedTreatment?.id === treatment.id
                                ? "bg-primary/10 border-primary"
                                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                            }`}
                            onClick={() => handleSelectTreatment(treatment)}
                            data-testid={`treatment-${treatment.id}`}
                          >
                            <div className="font-medium text-sm mb-1">{treatment.tituloTratamento}</div>
                            <div className="text-xs text-gray-500 mb-2">Início: {formatDate(treatment.dataInicio)}</div>
                            {getStatusBadge(treatment.situacaoTratamento)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Nenhum tratamento encontrado</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3"
                          onClick={() => handleCreateTreatment(selectedPatient)}
                        >
                          Criar primeiro tratamento
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center h-96">
                    <div className="text-center text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Selecione um paciente para ver os tratamentos</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Treatment Details */}
            <div className="lg:col-span-6">
              {selectedTreatment ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedTreatment.tituloTratamento}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="overview" className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Visão Geral
                        </TabsTrigger>
                        <TabsTrigger value="anamnesis" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Anamnese
                        </TabsTrigger>
                        <TabsTrigger value="budget" className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Orçamento
                        </TabsTrigger>
                        <TabsTrigger value="movements" className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Movimentação
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="overview" className="mt-6">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-gray-700">Data de Início</label>
                              <p className="text-sm">{formatDate(selectedTreatment.dataInicio)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700">Situação</label>
                              <div className="mt-1">
                                {getStatusBadge(selectedTreatment.situacaoTratamento)}
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            <Card>
                              <CardContent className="p-4 text-center">
                                <DollarSign className="h-8 w-8 mx-auto mb-2 text-green-600" />
                                <div className="text-sm text-gray-600">Valor Total</div>
                                <div className="text-lg font-bold">
                                  {budgetSummary ? formatCurrency(budgetSummary.totalOrcamento) : "R$ 0,00"}
                                </div>
                              </CardContent>
                            </Card>
                            
                            <Card>
                              <CardContent className="p-4 text-center">
                                <FileText className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                                <div className="text-sm text-gray-600">Itens no Orçamento</div>
                                <div className="text-lg font-bold">{budgetItems.length}</div>
                              </CardContent>
                            </Card>
                            
                            <Card>
                              <CardContent className="p-4 text-center">
                                <Activity className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                                <div className="text-sm text-gray-600">Movimentações</div>
                                <div className="text-lg font-bold">{treatmentMovements.length}</div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="anamnesis" className="mt-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium">Questionário de Anamnese</h3>
                            <Button size="sm" onClick={handleOpenAnamnesis}>
                              <Plus className="h-4 w-4 mr-1" />
                              {anamnesisResponses.length > 0 ? "Editar Anamnese" : "Preencher Anamnese"}
                            </Button>
                          </div>
                          
                          {anamnesisResponses.length > 0 ? (
                            <div className="space-y-3">
                              <h4 className="font-medium text-sm text-green-600 mb-4">✓ Anamnese preenchida</h4>
                              {anamnesisResponses.map((response) => (
                                <Card key={response.id} className="p-4">
                                  <div className="space-y-2">
                                    <h5 className="font-medium text-sm">Pergunta {response.questionId.slice(-4)}</h5>
                                    <div className="text-sm">
                                      <span className="font-medium">Resposta:</span> {response.resposta || "Não respondido"}
                                    </div>
                                    {response.observacoes && (
                                      <div className="text-sm text-gray-600">
                                        <span className="font-medium">Observações:</span> {response.observacoes}
                                      </div>
                                    )}
                                    <div className="text-xs text-gray-400">
                                      Respondido em: {formatDate(response.createdAt)}
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center text-gray-500 py-8">
                              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                              <p>Anamnese não preenchida para este tratamento</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="budget" className="mt-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium">Orçamento Detalhado</h3>
                            <Button size="sm" onClick={handleCreateBudgetItem}>
                              <Plus className="h-4 w-4 mr-1" />
                              Adicionar Item
                            </Button>
                          </div>
                          
                          {budgetItems.length > 0 ? (
                            <>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead className="w-20">Ações</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {budgetItems.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.descricaoOrcamento}</TableCell>
                                      <TableCell className="text-right">
                                        {formatCurrency(item.valorOrcamento)}
                                      </TableCell>
                                      <TableCell>
                                        <Button 
                                          variant="ghost" 
                                          size="sm"
                                          onClick={() => handleEditBudgetItem(item)}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              
                              {budgetSummary && (
                                <div className="bg-gray-50 p-4 rounded-lg">
                                  <div className="flex justify-between items-center text-sm mb-2">
                                    <span>Subtotal:</span>
                                    <span>{formatCurrency(budgetSummary.subtotalOrcamento)}</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm mb-2">
                                    <span>Desconto:</span>
                                    <div className="flex items-center space-x-2">
                                      <span className="text-red-600">-{formatCurrency(budgetSummary.descontoOrcamento)}</span>
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={handleEditDiscount}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="flex justify-between items-center text-lg font-bold pt-2 border-t">
                                    <span>Total:</span>
                                    <span>{formatCurrency(budgetSummary.totalOrcamento)}</span>
                                  </div>
                                  {budgetSummary.condicaoPagamento && (
                                    <div className="text-sm text-gray-600 mt-2">
                                      Condições: {budgetSummary.condicaoPagamento}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-center text-gray-500 py-8">
                              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                              <p>Nenhum item no orçamento</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="movements" className="mt-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium">Histórico de Movimentações</h3>
                            <Button size="sm" onClick={handleCreateMovement}>
                              <Plus className="h-4 w-4 mr-1" />
                              Nova Movimentação
                            </Button>
                          </div>
                          
                          {treatmentMovements.length > 0 ? (
                            <>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead className="w-20">Ações</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {treatmentMovements.map((movement) => (
                                    <TableRow key={movement.id}>
                                      <TableCell className="text-sm">
                                        {formatDate(movement.dataMovimentacao)}
                                      </TableCell>
                                      <TableCell>
                                        <div>
                                          <div className="font-medium">{movement.descricaoAtividade}</div>
                                          {movement.fotoAtividade && (
                                            <div className="mt-2">
                                              <img 
                                                src={movement.fotoAtividade} 
                                                alt="Foto da atividade" 
                                                className="w-16 h-16 object-cover rounded border cursor-pointer"
                                                onClick={() => window.open(movement.fotoAtividade, '_blank')}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {formatCurrency(movement.valorServico)}
                                      </TableCell>
                                      <TableCell>
                                        <Button 
                                          variant="ghost" 
                                          size="sm"
                                          onClick={() => handleEditMovement(movement)}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              
                              {/* Totalizador das Movimentações */}
                              <div className="border-t pt-4 mt-4">
                                <div className="flex justify-end">
                                  <div className="w-80 space-y-2">
                                    <div className="flex justify-between text-lg font-bold">
                                      <span>Total das Movimentações:</span>
                                      <span>
                                        {formatCurrency(
                                          treatmentMovements.reduce((sum, movement) => 
                                            sum + parseFloat(movement.valorServico), 0
                                          ).toString()
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-center text-gray-500 py-8">
                              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                              <p>Nenhuma movimentação registrada</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ) : selectedPatient ? (
                <Card>
                  <CardContent className="flex items-center justify-center h-96">
                    <div className="text-center text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Selecione um tratamento para ver os detalhes</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center h-96">
                    <div className="text-center text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Selecione um paciente e tratamento para visualizar o prontuário</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>

      <TreatmentModal
        isOpen={isTreatmentModalOpen}
        onClose={() => setIsTreatmentModalOpen(false)}
        patient={selectedPatient}
        treatment={selectedTreatment}
      />

      <BudgetItemModal
        isOpen={isBudgetItemModalOpen}
        onClose={() => setIsBudgetItemModalOpen(false)}
        treatment={selectedTreatment}
        budgetItem={selectedBudgetItem}
      />

      <TreatmentMovementModal
        isOpen={isTreatmentMovementModalOpen}
        onClose={() => setIsTreatmentMovementModalOpen(false)}
        treatment={selectedTreatment}
        movement={selectedMovement}
      />

      <AnamnesisModal
        isOpen={isAnamnesisModalOpen}
        onClose={() => setIsAnamnesisModalOpen(false)}
        treatment={selectedTreatment}
      />

      <BudgetDiscountModal
        isOpen={isBudgetDiscountModalOpen}
        onClose={() => setIsBudgetDiscountModalOpen(false)}
        treatment={selectedTreatment}
        budgetSummary={budgetSummary || null}
      />
    </div>
  );
}