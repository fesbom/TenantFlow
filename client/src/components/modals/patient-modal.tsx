import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Patient, User } from "@/types";

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: Patient | null;
}

interface PatientFormData {
  fullName: string;
  cpf: string;
  rg: string;
  email: string;
  phone: string;
  workPhone: string;
  birthDate: string;
  birthCity: string;
  maritalStatus: string;
  
  // Endereço completo
  cep: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  
  // Vínculos e responsáveis
  responsibleDentistId: string;
  responsibleName: string;
  responsibleCpf: string;
  
  // Marketing e histórico
  howDidYouKnowUs: string;
  howDidYouKnowUsOther: string;
  lastVisitDate: string;
  lastContactDate: string;
  
  medicalNotes: string;
}

export default function PatientModal({ isOpen, onClose, patient }: PatientModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showOtherField, setShowOtherField] = useState(false);

  // Fetch dentists for the dropdown
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isOpen,
  });

  const dentists = users.filter(user => user.role === 'dentist' && user.isActive);

  const [formData, setFormData] = useState<PatientFormData>({
    fullName: "",
    cpf: "",
    rg: "",
    email: "",
    phone: "",
    workPhone: "",
    birthDate: "",
    birthCity: "",
    maritalStatus: "",
    
    // Endereço completo
    cep: "",
    address: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    
    // Vínculos e responsáveis
    responsibleDentistId: "",
    responsibleName: "",
    responsibleCpf: "",
    
    // Marketing e histórico
    howDidYouKnowUs: "",
    howDidYouKnowUsOther: "",
    lastVisitDate: "",
    lastContactDate: "",
    
    medicalNotes: "",
  });

  useEffect(() => {
    if (patient) {
      setFormData({
        fullName: patient.fullName,
        cpf: patient.cpf || "",
        rg: (patient as any).rg || "",
        email: patient.email || "",
        phone: patient.phone,
        workPhone: (patient as any).workPhone || "",
        birthDate: patient.birthDate || "",
        birthCity: (patient as any).birthCity || "",
        maritalStatus: (patient as any).maritalStatus || "",
        
        // Endereço completo
        cep: (patient as any).cep || "",
        address: patient.address || "",
        number: (patient as any).number || "",
        complement: (patient as any).complement || "",
        neighborhood: (patient as any).neighborhood || "",
        city: (patient as any).city || "",
        state: (patient as any).state || "",
        
        // Vínculos e responsáveis
        responsibleDentistId: (patient as any).responsibleDentistId || "",
        responsibleName: (patient as any).responsibleName || "",
        responsibleCpf: (patient as any).responsibleCpf || "",
        
        // Marketing e histórico
        howDidYouKnowUs: (patient as any).howDidYouKnowUs || "",
        howDidYouKnowUsOther: (patient as any).howDidYouKnowUsOther || "",
        lastVisitDate: (patient as any).lastVisitDate || "",
        lastContactDate: (patient as any).lastContactDate || "",
        
        medicalNotes: patient.medicalNotes || "",
      });
      setShowOtherField((patient as any).howDidYouKnowUs === 'Outros');
    } else {
      setFormData({
        fullName: "",
        cpf: "",
        rg: "",
        email: "",
        phone: "",
        workPhone: "",
        birthDate: "",
        birthCity: "",
        maritalStatus: "",
        
        // Endereço completo
        cep: "",
        address: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        
        // Vínculos e responsáveis
        responsibleDentistId: "",
        responsibleName: "",
        responsibleCpf: "",
        
        // Marketing e histórico
        howDidYouKnowUs: "",
        howDidYouKnowUsOther: "",
        lastVisitDate: "",
        lastContactDate: "",
        
        medicalNotes: "",
      });
      setShowOtherField(false);
    }
  }, [patient]);

  const createPatientMutation = useMutation({
    mutationFn: async (data: PatientFormData) => {
      const response = await apiRequest("POST", "/api/patients", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Paciente cadastrado",
        description: "Paciente cadastrado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao cadastrar paciente",
        description: "Não foi possível cadastrar o paciente",
        variant: "destructive",
      });
    },
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (data: PatientFormData) => {
      const response = await apiRequest("PUT", `/api/patients/${patient!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Paciente atualizado",
        description: "Dados do paciente atualizados com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar paciente",
        description: "Não foi possível atualizar os dados do paciente",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (patient) {
      updatePatientMutation.mutate(formData);
    } else {
      createPatientMutation.mutate(formData);
    }
  };

  const handleInputChange = (field: keyof PatientFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Handle "Como nos conheceu" change to show/hide other field
    if (field === 'howDidYouKnowUs') {
      setShowOtherField(value === 'Outros');
      if (value !== 'Outros') {
        setFormData(prev => ({ ...prev, howDidYouKnowUsOther: '' }));
      }
    }
  };

  // CEP API integration function
  const fetchAddressByCep = async (cep: string) => {
    try {
      const cleanCep = cep.replace(/\D/g, '');
      if (cleanCep.length !== 8) return;

      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          address: data.logradouro || '',
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: data.uf || '',
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
    }
  };

  const handleCepBlur = () => {
    if (formData.cep) {
      fetchAddressByCep(formData.cep);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {patient ? "Editar Paciente" : "Cadastrar Novo Paciente"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Dados Pessoais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  placeholder="Digite o nome completo"
                  required
                  data-testid="input-patient-fullname"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={formData.cpf}
                  onChange={(e) => handleInputChange("cpf", e.target.value)}
                  placeholder="000.000.000-00"
                  data-testid="input-patient-cpf"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rg">RG</Label>
                <Input
                  id="rg"
                  value={formData.rg}
                  onChange={(e) => handleInputChange("rg", e.target.value)}
                  placeholder="00.000.000-0"
                  data-testid="input-patient-rg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate">Data de Nascimento</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => handleInputChange("birthDate", e.target.value)}
                  data-testid="input-patient-birthdate"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthCity">Cidade de Nascimento</Label>
                <Input
                  id="birthCity"
                  value={formData.birthCity}
                  onChange={(e) => handleInputChange("birthCity", e.target.value)}
                  placeholder="Cidade onde nasceu"
                  data-testid="input-patient-birthcity"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maritalStatus">Estado Civil</Label>
                <Select value={formData.maritalStatus} onValueChange={(value) => handleInputChange("maritalStatus", value)}>
                  <SelectTrigger data-testid="select-patient-maritalstatus">
                    <SelectValue placeholder="Selecione o estado civil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                    <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                    <SelectItem value="Divorciado(a)">Divorciado(a)</SelectItem>
                    <SelectItem value="Viúvo(a)">Viúvo(a)</SelectItem>
                    <SelectItem value="União Estável">União Estável</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="(11) 99999-9999"
                  required
                  data-testid="input-patient-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="workPhone">Fone de Trabalho</Label>
                <Input
                  id="workPhone"
                  value={formData.workPhone}
                  onChange={(e) => handleInputChange("workPhone", e.target.value)}
                  placeholder="(11) 3333-3333"
                  data-testid="input-patient-workphone"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="email@exemplo.com"
                  data-testid="input-patient-email"
                />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={formData.cep}
                  onChange={(e) => handleInputChange("cep", e.target.value)}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  data-testid="input-patient-cep"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="address">Logradouro</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  placeholder="Rua, Avenida, Travessa..."
                  data-testid="input-patient-address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="number">Número</Label>
                <Input
                  id="number"
                  value={formData.number}
                  onChange={(e) => handleInputChange("number", e.target.value)}
                  placeholder="123"
                  data-testid="input-patient-number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="complement">Complemento</Label>
                <Input
                  id="complement"
                  value={formData.complement}
                  onChange={(e) => handleInputChange("complement", e.target.value)}
                  placeholder="Apto, Bloco, Casa..."
                  data-testid="input-patient-complement"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input
                  id="neighborhood"
                  value={formData.neighborhood}
                  onChange={(e) => handleInputChange("neighborhood", e.target.value)}
                  placeholder="Nome do bairro"
                  data-testid="input-patient-neighborhood"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder="Nome da cidade"
                  data-testid="input-patient-city"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Estado</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleInputChange("state", e.target.value)}
                  placeholder="UF"
                  maxLength={2}
                  data-testid="input-patient-state"
                />
              </div>
            </div>
          </div>

          {/* Vínculos e Responsáveis */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Vínculos e Responsáveis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="responsibleDentistId">Dentista Responsável</Label>
                <Select value={formData.responsibleDentistId} onValueChange={(value) => handleInputChange("responsibleDentistId", value)}>
                  <SelectTrigger data-testid="select-patient-dentist">
                    <SelectValue placeholder="Selecione o dentista responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {dentists.map((dentist) => (
                      <SelectItem key={dentist.id} value={dentist.id}>
                        {dentist.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsibleName">Responsável (para menores)</Label>
                <Input
                  id="responsibleName"
                  value={formData.responsibleName}
                  onChange={(e) => handleInputChange("responsibleName", e.target.value)}
                  placeholder="Nome do responsável legal"
                  data-testid="input-patient-responsible-name"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="responsibleCpf">CPF do Responsável</Label>
                <Input
                  id="responsibleCpf"
                  value={formData.responsibleCpf}
                  onChange={(e) => handleInputChange("responsibleCpf", e.target.value)}
                  placeholder="000.000.000-00"
                  data-testid="input-patient-responsible-cpf"
                />
              </div>
            </div>
          </div>

          {/* Informações de Marketing */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Informações Adicionais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="howDidYouKnowUs">Como nos conheceu?</Label>
                <Select value={formData.howDidYouKnowUs} onValueChange={(value) => handleInputChange("howDidYouKnowUs", value)}>
                  <SelectTrigger data-testid="select-patient-howdidyouknowus">
                    <SelectValue placeholder="Selecione uma opção" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Google">Google</SelectItem>
                    <SelectItem value="Propaganda de Rádio">Propaganda de Rádio</SelectItem>
                    <SelectItem value="Propaganda de TV">Propaganda de TV</SelectItem>
                    <SelectItem value="Redes Sociais">Redes Sociais</SelectItem>
                    <SelectItem value="Indicação">Indicação</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showOtherField && (
                <div className="space-y-2">
                  <Label htmlFor="howDidYouKnowUsOther">Especifique "Outros"</Label>
                  <Input
                    id="howDidYouKnowUsOther"
                    value={formData.howDidYouKnowUsOther}
                    onChange={(e) => handleInputChange("howDidYouKnowUsOther", e.target.value)}
                    placeholder="Como nos conheceu?"
                    data-testid="input-patient-howdidyouknowus-other"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="lastVisitDate">Data da Última Visita</Label>
                <Input
                  id="lastVisitDate"
                  type="date"
                  value={formData.lastVisitDate}
                  onChange={(e) => handleInputChange("lastVisitDate", e.target.value)}
                  data-testid="input-patient-lastvisitdate"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastContactDate">Último Contato</Label>
                <Input
                  id="lastContactDate"
                  type="date"
                  value={formData.lastContactDate}
                  onChange={(e) => handleInputChange("lastContactDate", e.target.value)}
                  data-testid="input-patient-lastcontactdate"
                />
              </div>
            </div>
          </div>

          {/* Observações Médicas */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Observações Médicas</h3>
            <div className="space-y-2">
              <Label htmlFor="medicalNotes">Observações</Label>
              <Textarea
                id="medicalNotes"
                value={formData.medicalNotes}
                onChange={(e) => handleInputChange("medicalNotes", e.target.value)}
                placeholder="Alergias, medicamentos, histórico relevante..."
                rows={4}
                data-testid="textarea-patient-medicalnotes"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-patient"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createPatientMutation.isPending || updatePatientMutation.isPending}
              data-testid="button-save-patient"
            >
              {createPatientMutation.isPending || updatePatientMutation.isPending
                ? "Salvando..."
                : patient
                ? "Atualizar"
                : "Salvar Paciente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
