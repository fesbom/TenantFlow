import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { uploadFiles } from "@/lib/api";
import { Treatment, TreatmentMovement } from "@/types";
import { Camera, X } from "lucide-react";

interface TreatmentMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  treatment: Treatment | null;
  movement?: TreatmentMovement | null;
}

interface TreatmentMovementFormData {
  treatmentId: string;
  dataMovimentacao: string;
  descricaoAtividade: string;
  valorServico: string;
  region?: string;
  toothNumber?: string;
}

export default function TreatmentMovementModal({ isOpen, onClose, treatment, movement }: TreatmentMovementModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<TreatmentMovementFormData>({
    treatmentId: "",
    dataMovimentacao: "",
    descricaoAtividade: "",
    valorServico: "",
    region: "",
    toothNumber: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (movement) {
      setFormData({
        treatmentId: movement.treatmentId,
        dataMovimentacao: movement.dataMovimentacao,
        descricaoAtividade: movement.descricaoAtividade,
        valorServico: movement.valorServico,
        region: movement.region || "",
        toothNumber: movement.toothNumber || "",
      });
      if (movement.fotoAtividade) {
        setPreviewUrl(movement.fotoAtividade);
      }
    } else if (treatment) {
      setFormData({
        treatmentId: treatment.id,
        dataMovimentacao: new Date().toISOString().split('T')[0],
        descricaoAtividade: "",
        valorServico: "",
        region: "",
        toothNumber: "",
      });
    }
    setSelectedFile(null);
  }, [movement, treatment]);

  const createMovementMutation = useMutation({
    mutationFn: async (data: TreatmentMovementFormData) => {
      if (!treatment) throw new Error("Treatment is required");

      const formDataToSend = new FormData();
      formDataToSend.append("treatmentId", data.treatmentId);
      formDataToSend.append("dataMovimentacao", data.dataMovimentacao);
      formDataToSend.append("descricaoAtividade", data.descricaoAtividade);
      formDataToSend.append("valorServico", data.valorServico);
      
      if (data.region) {
        formDataToSend.append("region", data.region);
      }
      if (data.toothNumber) {
        formDataToSend.append("toothNumber", data.toothNumber);
      }

      if (selectedFile) {
        formDataToSend.append("photo", selectedFile);
      }

      const response = await uploadFiles("/api/treatment-movements", formDataToSend);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treatment-movements/treatment", treatment?.id] });
      toast({
        title: "Movimentação adicionada",
        description: "Movimentação do tratamento adicionada com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao adicionar movimentação",
        description: "Não foi possível adicionar a movimentação",
        variant: "destructive",
      });
    },
  });

  const updateMovementMutation = useMutation({
    mutationFn: async (data: TreatmentMovementFormData) => {
      if (!treatment || !movement) throw new Error("Treatment and movement are required");

      const formDataToSend = new FormData();
      formDataToSend.append("treatmentId", data.treatmentId);
      formDataToSend.append("dataMovimentacao", data.dataMovimentacao);
      formDataToSend.append("descricaoAtividade", data.descricaoAtividade);
      formDataToSend.append("valorServico", data.valorServico);
      
      if (data.region) {
        formDataToSend.append("region", data.region);
      }
      if (data.toothNumber) {
        formDataToSend.append("toothNumber", data.toothNumber);
      }

      if (selectedFile) {
        formDataToSend.append("photo", selectedFile);
      }

      const response = await uploadFiles(`/api/treatment-movements/${movement.id}`, formDataToSend, 'PUT');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treatment-movements/treatment", treatment?.id] });
      toast({
        title: "Movimentação atualizada",
        description: "Movimentação do tratamento atualizada com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar movimentação",
        description: "Não foi possível atualizar a movimentação",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.descricaoAtividade.trim()) {
      toast({
        title: "Descrição obrigatória",
        description: "Por favor, descreva a atividade realizada",
        variant: "destructive",
      });
      return;
    }

    if (!formData.valorServico || parseFloat(formData.valorServico) < 0) {
      toast({
        title: "Valor inválido",
        description: "Por favor, informe um valor válido para o serviço",
        variant: "destructive",
      });
      return;
    }

    if (movement) {
      updateMovementMutation.mutate(formData);
    } else {
      createMovementMutation.mutate(formData);
    }
  };

  const handleInputChange = (field: keyof TreatmentMovementFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Arquivo inválido",
          description: "Apenas arquivos de imagem são permitidos",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const isLoading = createMovementMutation.isPending || updateMovementMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {movement ? "Editar Movimentação" : "Nova Movimentação"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="data">Data da Movimentação</Label>
            <Input
              id="data"
              type="date"
              value={formData.dataMovimentacao}
              onChange={(e) => handleInputChange('dataMovimentacao', e.target.value)}
              data-testid="input-movement-date"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="atividade">Descrição da Atividade</Label>
            <Textarea
              id="atividade"
              value={formData.descricaoAtividade}
              onChange={(e) => handleInputChange('descricaoAtividade', e.target.value)}
              placeholder="Descreva a atividade realizada no tratamento..."
              data-testid="input-movement-description"
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor do Serviço (R$)</Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              value={formData.valorServico}
              onChange={(e) => handleInputChange('valorServico', e.target.value)}
              placeholder="0,00"
              data-testid="input-movement-value"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Região (opcional)</Label>
            <Input
              id="region"
              type="text"
              value={formData.region || ""}
              onChange={(e) => handleInputChange('region', e.target.value)}
              placeholder="Ex: Superior direita, Inferior esquerda..."
              data-testid="input-movement-region"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="toothNumber">Número do Dente (opcional)</Label>
            <Input
              id="toothNumber"
              type="text"
              value={formData.toothNumber || ""}
              onChange={(e) => handleInputChange('toothNumber', e.target.value)}
              placeholder="Ex: 16, 21, 36-37..."
              data-testid="input-movement-tooth"
            />
          </div>

          <div className="space-y-2">
            <Label>Foto da Atividade (opcional)</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('photo-input')?.click()}
                  className="flex items-center space-x-2"
                >
                  <Camera className="h-4 w-4" />
                  <span>Selecionar Foto</span>
                </Button>
                <input
                  id="photo-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              
              {previewUrl && (
                <div className="relative inline-block">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-32 h-32 object-cover rounded border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={removeImage}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
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
              data-testid="button-save-movement"
            >
              {isLoading ? "Salvando..." : movement ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}