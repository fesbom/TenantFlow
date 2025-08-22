import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Treatment, BudgetSummary, BudgetItem } from "@/types";

interface BudgetDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  treatment: Treatment | null;
  budgetSummary: BudgetSummary | null;
}

interface DiscountFormData {
  descontoOrcamento: string;
  condicaoPagamento: string;
}

export default function BudgetDiscountModal({ isOpen, onClose, treatment, budgetSummary }: BudgetDiscountModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<DiscountFormData>({
    descontoOrcamento: "0",
    condicaoPagamento: "À vista",
  });

  useEffect(() => {
    if (budgetSummary) {
      setFormData({
        descontoOrcamento: budgetSummary.descontoOrcamento,
        condicaoPagamento: budgetSummary.condicaoPagamento || "À vista",
      });
    }
  }, [budgetSummary]);

  const updateDiscountMutation = useMutation({
    mutationFn: async (data: DiscountFormData) => {
      if (!treatment) throw new Error("Treatment is required");

      // Get all budget items for this treatment
      const budgetItemsResponse = await apiRequest("GET", `/api/budget-items/treatment/${treatment.id}`, undefined);
      const budgetItems = await budgetItemsResponse.json();
      
      // Calculate subtotal
      const subtotal = budgetItems.reduce((sum: number, item: BudgetItem) => 
        sum + parseFloat(item.valorOrcamento), 0
      );
      
      const discount = parseFloat(data.descontoOrcamento) || 0;
      const total = subtotal - discount;
      
      // Update or create budget summary
      const response = await apiRequest("POST", "/api/budget-summary", {
        treatmentId: treatment.id,
        subtotalOrcamento: subtotal.toString(),
        descontoOrcamento: discount.toString(),
        totalOrcamento: total.toString(),
        condicaoPagamento: data.condicaoPagamento
      });
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-summary/treatment", treatment?.id] });
      toast({
        title: "Orçamento atualizado",
        description: "Desconto e condições de pagamento atualizados com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar orçamento",
        description: "Não foi possível atualizar o desconto",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const discount = parseFloat(formData.descontoOrcamento);
    if (discount < 0) {
      toast({
        title: "Desconto inválido",
        description: "O desconto não pode ser negativo",
        variant: "destructive",
      });
      return;
    }

    updateDiscountMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof DiscountFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isLoading = updateDiscountMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Orçamento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="desconto">Desconto (R$)</Label>
            <Input
              id="desconto"
              type="number"
              step="0.01"
              min="0"
              value={formData.descontoOrcamento}
              onChange={(e) => handleInputChange('descontoOrcamento', e.target.value)}
              placeholder="0,00"
              data-testid="input-discount"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="condicoes">Condições de Pagamento</Label>
            <Textarea
              id="condicoes"
              value={formData.condicaoPagamento}
              onChange={(e) => handleInputChange('condicaoPagamento', e.target.value)}
              placeholder="Ex: À vista, 3x sem juros, 10x com juros..."
              data-testid="input-payment-conditions"
              rows={3}
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
              data-testid="button-save-discount"
            >
              {isLoading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}