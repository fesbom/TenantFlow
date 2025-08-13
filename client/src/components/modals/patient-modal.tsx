import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Patient } from "@/types";

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: Patient | null;
}

interface PatientFormData {
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: string;
  address: string;
  medicalNotes: string;
}

export default function PatientModal({ isOpen, onClose, patient }: PatientModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<PatientFormData>({
    fullName: "",
    cpf: "",
    email: "",
    phone: "",
    birthDate: "",
    address: "",
    medicalNotes: "",
  });

  useEffect(() => {
    if (patient) {
      setFormData({
        fullName: patient.fullName,
        cpf: patient.cpf || "",
        email: patient.email || "",
        phone: patient.phone,
        birthDate: patient.birthDate || "",
        address: patient.address || "",
        medicalNotes: patient.medicalNotes || "",
      });
    } else {
      setFormData({
        fullName: "",
        cpf: "",
        email: "",
        phone: "",
        birthDate: "",
        address: "",
        medicalNotes: "",
      });
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
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {patient ? "Editar Paciente" : "Cadastrar Novo Paciente"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange("address", e.target.value)}
                placeholder="Endereço completo"
                rows={3}
                data-testid="textarea-patient-address"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="medicalNotes">Observações Médicas</Label>
              <Textarea
                id="medicalNotes"
                value={formData.medicalNotes}
                onChange={(e) => handleInputChange("medicalNotes", e.target.value)}
                placeholder="Alergias, medicamentos, histórico relevante..."
                rows={3}
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
