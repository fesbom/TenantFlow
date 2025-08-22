import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BudgetItem, Treatment } from "@/types";

interface BudgetItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  treatment: Treatment | null;
  budgetItem?: BudgetItem | null;
}

interface BudgetItemFormData {
  treatmentId: string;
  descricaoOrcamento: string;
  valorOrcamento: string;
}

export default function BudgetItemModal({ isOpen, onClose, treatment, budgetItem }: BudgetItemModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<BudgetItemFormData>({
    treatmentId: "",
    descricaoOrcamento: "",
    valorOrcamento: "",
  });

  useEffect(() => {
    if (budgetItem) {
      setFormData({
        treatmentId: budgetItem.treatmentId,
        descricaoOrcamento: budgetItem.descricaoOrcamento,
        valorOrcamento: budgetItem.valorOrcamento,
      });
    } else if (treatment) {
      setFormData({
        treatmentId: treatment.id,
        descricaoOrcamento: "",
        valorOrcamento: "",
      });
    }
  }, [budgetItem, treatment]);

  const createBudgetItemMutation = useMutation({
    mutationFn: async (data: BudgetItemFormData) => {
      const response = await apiRequest("POST", "/api/budget-items", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-items/treatment", treatment?.id] });
      calculateAndUpdateSummary();
      toast({
        title: "Item adicionado",
        description: "Item do orçamento adicionado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao adicionar item",
        description: "Não foi possível adicionar o item do orçamento",
        variant: "destructive",
      });
    },
  });

  const updateBudgetItemMutation = useMutation({
    mutationFn: async (data: BudgetItemFormData) => {
      const response = await apiRequest("PUT", `/api/budget-items/${budgetItem?.id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-items/treatment", treatment?.id] });
      calculateAndUpdateSummary();
      toast({
        title: "Item atualizado",
        description: "Item do orçamento atualizado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar item",
        description: "Não foi possível atualizar o item do orçamento",
        variant: "destructive",
      });
    },
  });

  const calculateAndUpdateSummary = async () => {
    if (!treatment) return;
    
    try {
      // Get all budget items for this treatment
      const budgetItemsResponse = await apiRequest("GET", `/api/budget-items/treatment/${treatment.id}`, undefined);
      const budgetItems = await budgetItemsResponse.json();
      
      // Calculate subtotal
      const subtotal = budgetItems.reduce((sum: number, item: BudgetItem) => 
        sum + parseFloat(item.valorOrcamento), 0
      );
      
      const discount = 0; // Default discount
      const total = subtotal - discount;
      
      // Update or create budget summary
      await apiRequest("POST", "/api/budget-summary", {
        treatmentId: treatment.id,
        subtotalOrcamento: subtotal.toString(),
        descontoOrcamento: discount.toString(),
        totalOrcamento: total.toString(),
        condicaoPagamento: "À vista"
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/budget-summary/treatment", treatment.id] });
    } catch (error) {
      console.error("Error updating budget summary:", error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.descricaoOrcamento.trim()) {
      toast({
        title: "Descrição obrigatória",
        description: "Por favor, informe a descrição do item",
        variant: "destructive",
      });
      return;
    }

    if (!formData.valorOrcamento || parseFloat(formData.valorOrcamento) <= 0) {
      toast({
        title: "Valor inválido",
        description: "Por favor, informe um valor válido",
        variant: "destructive",
      });
      return;
    }

    if (budgetItem) {
      updateBudgetItemMutation.mutate(formData);
    } else {
      createBudgetItemMutation.mutate(formData);
    }
  };

  const handleInputChange = (field: keyof BudgetItemFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isLoading = createBudgetItemMutation.isPending || updateBudgetItemMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {budgetItem ? "Editar Item do Orçamento" : "Adicionar Item ao Orçamento"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              value={formData.descricaoOrcamento}
              onChange={(e) => handleInputChange('descricaoOrcamento', e.target.value)}
              placeholder="Ex: Limpeza dentária, Obturação..."
              data-testid="input-budget-description"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor (R$)</Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              value={formData.valorOrcamento}
              onChange={(e) => handleInputChange('valorOrcamento', e.target.value)}
              placeholder="0,00"
              data-testid="input-budget-value"
              required
            />
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
              data-testid="button-save-budget-item"
            >
              {isLoading ? "Salvando..." : budgetItem ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}