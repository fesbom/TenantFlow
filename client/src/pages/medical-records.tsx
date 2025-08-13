import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import MedicalRecordModal from "@/components/modals/medical-record-modal";
import { Patient, MedicalRecord } from "@/types";
import { Search, Plus, FileText, Image, Eye } from "lucide-react";

export default function MedicalRecords() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch patients
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  // Fetch medical records for selected patient
  const { data: medicalRecords = [], isLoading } = useQuery<MedicalRecord[]>({
    queryKey: ["/api/medical-records/patient", selectedPatient?.id],
    enabled: !!selectedPatient,
  });

  const filteredPatients = patients.filter(patient =>
    patient.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone.includes(searchTerm)
  );

  const handleCreateRecord = (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedRecord(null);
    setIsModalOpen(true);
  };

  const handleViewRecord = (record: MedicalRecord) => {
    setSelectedRecord(record);
    setIsModalOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: string | undefined) => {
    if (!value) return "-";
    return `R$ ${parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  const getImageCount = (images: string | undefined) => {
    if (!images) return 0;
    try {
      const imageArray = JSON.parse(images);
      return Array.isArray(imageArray) ? imageArray.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="lg:pl-64">
        <Header title="Prontuários" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Patients List */}
            <div className="lg:col-span-1">
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

            {/* Medical Records */}
            <div className="lg:col-span-2">
              {selectedPatient ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Prontuários - {selectedPatient.fullName}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">
                          Telefone: {selectedPatient.phone}
                        </p>
                      </div>
                      <Button
                        onClick={() => handleCreateRecord(selectedPatient)}
                        data-testid="button-new-record"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Prontuário
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="text-center py-8 text-gray-500">
                        Carregando prontuários...
                      </div>
                    ) : medicalRecords.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>Nenhum prontuário encontrado</p>
                        <Button
                          className="mt-4"
                          onClick={() => handleCreateRecord(selectedPatient)}
                          data-testid="button-first-record"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Criar Primeiro Prontuário
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Procedimento</TableHead>
                              <TableHead>Valor</TableHead>
                              <TableHead>Imagens</TableHead>
                              <TableHead>Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {medicalRecords.map((record) => (
                              <TableRow key={record.id} data-testid={`record-${record.id}`}>
                                <TableCell>{formatDate(record.createdAt)}</TableCell>
                                <TableCell>{record.procedure}</TableCell>
                                <TableCell>{formatCurrency(record.cost)}</TableCell>
                                <TableCell>
                                  {getImageCount(record.images) > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Image className="h-3 w-3 mr-1" />
                                      {getImageCount(record.images)}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewRecord(record)}
                                    data-testid={`button-view-record-${record.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Selecione um paciente para ver os prontuários</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Medical Record Modal */}
      <MedicalRecordModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        patient={selectedPatient}
        record={selectedRecord}
      />
    </div>
  );
}
