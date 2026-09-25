import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Treatment, BudgetSummary } from "@/types";

interface ReceivableGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  treatment: Treatment | null;
  budgetSummary: BudgetSummary | null;
}

interface ReceivableGenerateFormData {
  valorTotal: string;
  totalParcelas: string;
  primeiraDataVencimento: string;
  observacoes: string;
}

export default function ReceivableGenerateModal({ isOpen, onClose, treatment, budgetSummary }: ReceivableGenerateModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<ReceivableGenerateFormData>({
    valorTotal: "",
    totalParcelas: "1",
    primeiraDataVencimento: new Date().toISOString().split("T")[0],
    observacoes: "",
  });

  // Sempre que o modal abre, sugere o valor total já calculado no orçamento do tratamento.
  useEffect(() => {
    if (isOpen && budgetSummary) {
      setFormData((prev) => ({ ...prev, valorTotal: budgetSummary.totalOrcamento }));
    }
  }, [isOpen, budgetSummary]);

  const generateMutation = useMutation({
    mutationFn: async (data: ReceivableGenerateFormData) => {
      if (!treatment) throw new Error("Tratamento é obrigatório");
      const response = await apiRequest("POST", `/api/treatments/${treatment.id}/receivables`, {
        valorTotal: parseFloat(data.valorTotal),
        totalParcelas: parseInt(data.totalParcelas, 10),
        primeiraDataVencimento: data.primeiraDataVencimento,
        descricao: treatment.tituloTratamento,
        observacoes: data.observacoes || undefined,
      });
      return response.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/receivables"] });
      toast({
        title: "Cobrança gerada",
        description: `${created.length} parcela(s) lançada(s) em Contas a Receber.`,
      });
      onClose();
    },
    onError: (error: unknown) => {
      toast({
        title: "Erro ao gerar cobrança",
        description: error instanceof Error ? error.message : "Não foi possível gerar os títulos.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const valor = parseFloat(formData.valorTotal);
    if (!valor || valor <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor total maior que zero.", variant: "destructive" });
      return;
    }
    const parcelas = parseInt(formData.totalParcelas, 10);
    if (!parcelas || parcelas < 1 || parcelas > 12) {
      toast({ title: "Parcelamento inválido", description: "Escolha de 1 a 12 parcelas.", variant: "destructive" });
      return;
    }
    if (!formData.primeiraDataVencimento) {
      toast({ title: "Vencimento obrigatório", description: "Informe a data da primeira parcela.", variant: "destructive" });
      return;
    }

    generateMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof ReceivableGenerateFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isLoading = generateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar Cobrança (Contas a Receber)</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="valorTotal">Valor Total (R$)</Label>
            <Input
              id="valorTotal"
              type="number"
              step="0.01"
              min="0"
              value={formData.valorTotal}
              onChange={(e) => handleInputChange("valorTotal", e.target.value)}
              placeholder="0,00"
              data-testid="input-receivable-total"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalParcelas">Número de Parcelas (1 a 12)</Label>
            <Input
              id="totalParcelas"
              type="number"
              min="1"
              max="12"
              value={formData.totalParcelas}
              onChange={(e) => handleInputChange("totalParcelas", e.target.value)}
              data-testid="input-receivable-installments"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="primeiraDataVencimento">Vencimento da 1ª Parcela</Label>
            <Input
              id="primeiraDataVencimento"
              type="date"
              value={formData.primeiraDataVencimento}
              onChange={(e) => handleInputChange("primeiraDataVencimento", e.target.value)}
              data-testid="input-receivable-due-date"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleInputChange("observacoes", e.target.value)}
              placeholder="Observações sobre a cobrança (opcional)"
              data-testid="input-receivable-notes"
              rows={2}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} data-testid="button-cancel">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} data-testid="button-generate-receivable">
              {isLoading ? "Gerando..." : "Gerar Cobrança"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
