import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MessageCircle, Send } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ReceivableReminderPreview {
  patientName: string;
  phone: string;
  total: number;
  bills: Array<{
    id: string;
    description: string;
    value: number;
    dueDate: string;
    formattedDueDate: string;
    status: "Vencido";
    installmentNumber: number;
    totalInstallments: number;
    daysLate: number;
  }>;
  message: string;
}

interface ReminderSendResponse {
  success: boolean;
  sentCount: number;
  providerMessageId?: string;
  providerStatus?: string;
}

interface ReceivableReminderDialogProps {
  receivableId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getApiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Não foi possível concluir a operação.";
  const rawMessage = error.message.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(rawMessage);
    return typeof parsed.message === "string" ? parsed.message : rawMessage;
  } catch {
    return rawMessage;
  }
}

export default function ReceivableReminderDialog({
  receivableId,
  open,
  onOpenChange,
  onSent,
}: ReceivableReminderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const previewQueryKey = ["/api/receivables", receivableId, "reminder-preview"];
  const { data: preview, isLoading, isError, error, refetch } = useQuery<ReceivableReminderPreview>({
    queryKey: previewQueryKey,
    queryFn: async () => {
      if (!receivableId) throw new Error("Título não selecionado.");
      const response = await apiRequest("GET", `/api/receivables/${receivableId}/reminder-preview`);
      return response.json();
    },
    enabled: open && !!receivableId,
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: async (): Promise<ReminderSendResponse> => {
      if (!receivableId || !preview) throw new Error("A prévia da cobrança não está disponível.");
      const response = await apiRequest("POST", `/api/receivables/${receivableId}/reminder`, {
        expectedReceivableIds: preview.bills.map((bill) => bill.id),
        expectedMessage: preview.message,
      });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Cobrança enviada",
        description: `A Evolution confirmou o envio em uma mensagem com ${result.sentCount} título(s).`,
      });
      onSent();
      onOpenChange(false);
    },
    onError: (sendError: unknown) => {
      toast({
        title: "Não foi possível enviar a cobrança",
        description: getApiErrorMessage(sendError),
        variant: "destructive",
      });
      void refetch();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Confirmar cobrança via WhatsApp
          </DialogTitle>
          <DialogDescription>
            Será enviada uma única mensagem com todas as parcelas vencidas deste paciente. Parcelas a vencer não serão incluídas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparando a cobrança...
          </div>
        ) : isError ? (
          <div className="space-y-3 py-4 text-sm">
            <p className="flex items-start gap-2 text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {getApiErrorMessage(error)}
            </p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-md border bg-slate-50 p-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Paciente</p>
                <p className="text-sm font-medium">{preview.patientName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">WhatsApp de destino</p>
                <p className="text-sm font-medium">+{preview.phone}</p>
              </div>
            </div>

            <section aria-label="Títulos incluídos na cobrança">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Títulos incluídos ({preview.bills.length})</h3>
                <p className="text-sm font-semibold">Total: {formatCurrency(preview.total)}</p>
              </div>
              <div className="divide-y rounded-md border px-3">
                {preview.bills.map((bill) => (
                  <div key={bill.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{bill.description || `Parcela ${bill.installmentNumber}/${bill.totalInstallments}`}</p>
                      <p className="text-xs text-gray-500">
                        Parcela {bill.installmentNumber}/{bill.totalInstallments} · {bill.status} · Vencimento {bill.formattedDueDate}
                        {bill.daysLate > 0 ? ` · ${bill.daysLate} dia(s) de atraso` : ""}
                      </p>
                    </div>
                    <span className="font-medium">{formatCurrency(bill.value)}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Prévia da mensagem</p>
              <Textarea value={preview.message} readOnly rows={9} className="resize-y text-sm" />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sendMutation.isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => sendMutation.mutate()}
            disabled={!preview || isError || isLoading || sendMutation.isPending}
            className="bg-green-700 text-white hover:bg-green-800"
          >
            {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {sendMutation.isPending ? "Enviando..." : "Confirmar e Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}