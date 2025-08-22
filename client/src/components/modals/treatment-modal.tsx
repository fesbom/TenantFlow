import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Patient, Treatment } from "@/types";

interface TreatmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  treatment?: Treatment | null;
}

interface TreatmentFormData {
  patientId: string;
  dataInicio: string;
  situacaoTratamento: "Em andamento" | "Concluído" | "Cancelado";
  tituloTratamento: string;
}

export default function TreatmentModal({ isOpen, onClose, patient, treatment }: TreatmentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<TreatmentFormData>({
    patientId: "",
    dataInicio: "",
    situacaoTratamento: "Em andamento",
    tituloTratamento: "",
  });

  useEffect(() => {
    if (treatment) {
      setFormData({
        patientId: treatment.patientId,
        dataInicio: treatment.dataInicio,
        situacaoTratamento: treatment.situacaoTratamento,
        tituloTratamento: treatment.tituloTratamento,
      });
    } else if (patient) {
      setFormData({
        patientId: patient.id,
        dataInicio: new Date().toISOString().split('T')[0],
        situacaoTratamento: "Em andamento",
        tituloTratamento: "",
      });
    }
  }, [treatment, patient]);

  const createTreatmentMutation = useMutation({
    mutationFn: async (data: TreatmentFormData) => {
      const response = await apiRequest("POST", "/api/treatments", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treatments/patient", patient?.id] });
      toast({
        title: "Tratamento criado",
        description: "Tratamento criado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao criar tratamento",
        description: "Não foi possível criar o tratamento",
        variant: "destructive",
      });
    },
  });

  const updateTreatmentMutation = useMutation({
    mutationFn: async (data: TreatmentFormData) => {
      const response = await apiRequest("PUT", `/api/treatments/${treatment?.id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treatments/patient", patient?.id] });
      toast({
        title: "Tratamento atualizado",
        description: "Tratamento atualizado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar tratamento",
        description: "Não foi possível atualizar o tratamento",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.tituloTratamento.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Por favor, informe o título do tratamento",
        variant: "destructive",
      });
      return;
    }

    if (treatment) {
      updateTreatmentMutation.mutate(formData);
    } else {
      createTreatmentMutation.mutate(formData);
    }
  };

  const handleInputChange = (field: keyof TreatmentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isLoading = createTreatmentMutation.isPending || updateTreatmentMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {treatment ? "Editar Tratamento" : "Novo Tratamento"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título do Tratamento</Label>
            <Input
              id="titulo"
              value={formData.tituloTratamento}
              onChange={(e) => handleInputChange('tituloTratamento', e.target.value)}
              placeholder="Ex: Tratamento Ortodôntico, Implante Dentário..."
              data-testid="input-treatment-title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataInicio">Data de Início</Label>
            <Input
              id="dataInicio"
              type="date"
              value={formData.dataInicio}
              onChange={(e) => handleInputChange('dataInicio', e.target.value)}
              data-testid="input-treatment-date"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="situacao">Situação do Tratamento</Label>
            <Select 
              value={formData.situacaoTratamento} 
              onValueChange={(value) => handleInputChange('situacaoTratamento', value as "Em andamento" | "Concluído" | "Cancelado")}
            >
              <SelectTrigger data-testid="select-treatment-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Em andamento">Em andamento</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isLoading}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-save-treatment"
            >
              {isLoading ? "Salvando..." : treatment ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}