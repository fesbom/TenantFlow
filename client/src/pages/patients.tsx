import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import PatientModal from "@/components/modals/patient-modal";
import InvoiceCopyModal, { DEFAULT_INVOICE_FIELDS } from "@/components/modals/invoice-copy-modal";
import { Patient, User as AppUser } from "@/types";
import { Search, Plus, Edit, Trash2, Phone, Mail, ChevronLeft, ChevronRight, User, FileText, SlidersHorizontal, ChevronDown, X } from "lucide-react";
import { formatDateBR } from "@/lib/date-formatter";
import { ProtectedImage } from "@/components/ui/protected-image";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PaginatedResponse {
  data: Patient[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export default function Patients() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedDentistId, setSelectedDentistId] = useState("all");
  const [monthsWithoutContact, setMonthsWithoutContact] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prefillData, setPrefillData] = useState<{ phone?: string; fullName?: string } | undefined>();
  const [invoicePatient, setInvoicePatient] = useState<Patient | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: users = [] } = useQuery<AppUser[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      if (!response.ok) throw new Error("Não foi possível carregar os dentistas");
      return response.json();
    },
  });
  const dentists = users.filter((user) => user.role === "dentist");

  // Fetch patients with pagination, search and filters.
  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/patients", {
      page: currentPage,
      pageSize: 10,
      search: debouncedSearch,
      dentistId: selectedDentistId,
      monthsWithoutContact,
    }],
    queryFn: async ({ queryKey }) => {
      const [_key, params] = queryKey as [string, {
        page: number;
        pageSize: number;
        search: string;
        dentistId: string;
        monthsWithoutContact: string;
      }];

      const searchParams = new URLSearchParams();
      searchParams.append('page', params.page.toString());
      searchParams.append('pageSize', params.pageSize.toString());
      if (params.search) {
        searchParams.append('search', params.search);
      }
      if (params.dentistId !== "all") {
        searchParams.append("dentistId", params.dentistId);
      }
      if (params.monthsWithoutContact) {
        searchParams.append("monthsWithoutContact", params.monthsWithoutContact);
      }

      const response = await fetch(`${_key}?${searchParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dental_token")}`,
        },
      });

      if (!response.ok) {
        throw new Error('A resposta da rede não foi bem-sucedida');
      }
      return response.json();
    },
  });


  const patients = data?.data || [];
  const pagination = data?.pagination;
  const hasActiveFilters = selectedDentistId !== "all" || monthsWithoutContact !== "";

  // Fetch invoice fields config
  const { data: invoiceFieldsData } = useQuery<{ fields: string[] }>({
    queryKey: ["/api/clinic/invoice-fields"],
    queryFn: async () => {
      const res = await fetch("/api/clinic/invoice-fields", {
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      if (!res.ok) return { fields: DEFAULT_INVOICE_FIELDS };
      return res.json();
    },
  });
  const activeInvoiceFields = invoiceFieldsData?.fields ?? DEFAULT_INVOICE_FIELDS;

  // Delete patient mutation
  const deletePatientMutation = useMutation({
    mutationFn: async (patientId: string) => {
      await apiRequest("DELETE", `/api/patients/${patientId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Paciente removido",
        description: "Paciente removido com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao remover paciente",
        description: "Não foi possível remover o paciente",
        variant: "destructive",
      });
    },
  });

  // Auto-abrir modal com dados pré-preenchidos via URL params (ex: /patients?phone=xxx&name=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phone = params.get("phone");
    const name = params.get("name");
    if (phone || name) {
      setPrefillData({ phone: phone || undefined, fullName: name || undefined });
      setSelectedPatient(null);
      setIsModalOpen(true);
      // Limpa os params sem recarregar a página
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleAddPatient = () => {
    setPrefillData(undefined);
    setSelectedPatient(null);
    setIsModalOpen(true);
  };

  const handleEditPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsModalOpen(true);
  };

  const handleDeletePatient = async (patientId: string) => {
    if (window.confirm("Tem certeza que deseja remover este paciente?")) {
      deletePatientMutation.mutate(patientId);
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
        <Header title="Pacientes" onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 lg:p-6 flex-grow">
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar pacientes por nome, telefone ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-patients"
              />
            </div>
            <Button onClick={handleAddPatient} data-testid="button-add-patient">
              <Plus className="h-4 w-4 mr-2" />
              Novo Paciente
            </Button>
          </div>

          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {hasActiveFilters ? "Filtros aplicados" : "Filtros opcionais"}
              </span>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" aria-expanded={filtersOpen} data-testid="button-toggle-patient-filters">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filtros
                  <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="mt-3 grid grid-cols-1 gap-4 rounded-md border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(200px,1fr)_auto] lg:items-end">
                <div className="space-y-2">
                  <label htmlFor="patient-filter-dentist" className="text-sm font-medium">Dentista responsável</label>
                  <select
                    id="patient-filter-dentist"
                    value={selectedDentistId}
                    onChange={(event) => {
                      setSelectedDentistId(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="select-filter-patient-dentist"
                  >
                    <option value="all">Todos os dentistas</option>
                    {dentists.map((dentist) => (
                      <option key={dentist.id} value={dentist.id}>{dentist.fullName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="patient-filter-months" className="text-sm font-medium">Sem contato há pelo menos</label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="patient-filter-months"
                      type="number"
                      min="1"
                      max="120"
                      step="1"
                      inputMode="numeric"
                      placeholder="Ex.: 6"
                      value={monthsWithoutContact}
                      onChange={(event) => {
                        setMonthsWithoutContact(event.target.value);
                        setCurrentPage(1);
                      }}
                      data-testid="input-filter-patient-months"
                    />
                    <span className="text-sm text-muted-foreground">meses</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Inclui quem ainda não tem data de último contato registrada.</p>
                </div>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedDentistId("all");
                      setMonthsWithoutContact("");
                      setCurrentPage(1);
                    }}
                    data-testid="button-clear-patient-filters"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Limpar filtros
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Patients Table */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Pacientes</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Carregando pacientes...</div>
              ) : patients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {debouncedSearch || hasActiveFilters ? "Nenhum paciente encontrado para os critérios informados" : "Nenhum paciente cadastrado"}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Contato</TableHead>
                          <TableHead>Data de Nascimento</TableHead>
                          <TableHead>Cadastrado em</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {patients.map((patient) => (
                          <TableRow key={patient.id} data-testid={`patient-row-${patient.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {/* Patient Photo */}
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  {patient.photoUrl ? (
                                    <ProtectedImage
                                      src={patient.photoUrl}
                                      alt={patient.fullName}
                                      className="w-full h-full object-cover"
                                      data-testid={`img-patient-photo-${patient.id}`}
                                    />
                                  ) : (
                                    <User className="w-5 h-5 text-gray-400" />
                                  )}
                                </div>

                                {/* Patient Info */}
                                <div>
                                  <div className="font-medium">{patient.fullName}</div>
                                  {patient.cpf && (
                                    <div className="text-sm text-gray-500">CPF: {patient.cpf}</div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center text-sm">
                                  <Phone className="h-3 w-3 mr-1 text-gray-400" />
                                  {patient.phone}
                                </div>
                                {patient.email && (
                                  <div className="flex items-center text-sm text-gray-500">
                                    <Mail className="h-3 w-3 mr-1 text-gray-400" />
                                    {patient.email}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {patient.birthDate ? formatDateBR(patient.birthDate) : "-"}
                            </TableCell>
                            <TableCell>{formatDateBR(patient.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setInvoicePatient(patient)}
                                  title="Cópia rápida para Nota Fiscal"
                                  className="text-teal-600 hover:text-teal-700"
                                  data-testid={`button-invoice-${patient.id}`}
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPatient(patient)}
                                  data-testid={`button-edit-${patient.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePatient(patient.id)}
                                  className="text-red-600 hover:text-red-700"
                                  data-testid={`button-delete-${patient.id}`}
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

                  {/* Pagination Controls */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-gray-600">
                        Mostrando {patients.length} de {pagination.totalCount} pacientes
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>
                        <span className="text-sm text-gray-600">
                          Página {pagination.page} de {pagination.totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                          disabled={currentPage === pagination.totalPages}
                          data-testid="button-next-page"
                        >
                          Próxima
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Patient Modal */}
      <PatientModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setPrefillData(undefined); }}
        patient={selectedPatient}
        prefillData={!selectedPatient ? prefillData : undefined}
      />

      {/* Invoice Copy Modal */}
      {invoicePatient && (
        <InvoiceCopyModal
          isOpen={!!invoicePatient}
          onClose={() => setInvoicePatient(null)}
          patient={invoicePatient}
          activeFields={activeInvoiceFields}
        />
      )}
    </div>
  );
}