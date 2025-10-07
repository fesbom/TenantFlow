import { useState, useEffect } from "react";
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
import { Patient } from "@/types";
import { Search, Plus, Edit, Trash2, Phone, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateBR } from "@/lib/date-formatter";

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
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  // Fetch patients with pagination and search --- CÓDIGO CORRIGIDO AQUI ---
  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/patients", { page: currentPage, pageSize: 10, search: debouncedSearch }],
    queryFn: async ({ queryKey }) => {
      const [_key, params] = queryKey as [string, { page: number; pageSize: number; search: string }];

      const searchParams = new URLSearchParams();
      searchParams.append('page', params.page.toString());
      searchParams.append('pageSize', params.pageSize.toString());
      if (params.search) {
        searchParams.append('search', params.search);
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

  const handleAddPatient = () => {
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
                  {debouncedSearch ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
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
                              <div>
                                <div className="font-medium">{patient.fullName}</div>
                                {patient.cpf && (
                                  <div className="text-sm text-gray-500">CPF: {patient.cpf}</div>
                                )}
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
        onClose={() => setIsModalOpen(false)}
        patient={selectedPatient}
      />
    </div>
  );
}