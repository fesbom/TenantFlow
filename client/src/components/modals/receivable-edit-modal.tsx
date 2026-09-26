import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Patient, ReceivableStatus, Treatment, User } from "@/types";

interface ReceivableEditRow {
  id: string;
  patientId: string;
  dentistId: string;
  treatmentId: string | null;
  descricao: string;
  valor: string;
  dataVencimento: string;
  dataPagamento: string | null;
  status: ReceivableStatus;
  numeroParcela: number;
  totalParcelas: number;
  observacoes: string | null;
}

interface ReceivableOptionsResponse {
  patients: Patient[];
  dentists: User[];
}

interface ReceivableEditModalProps {
  isOpen: boolean;
  mode: "edit" | "installments";
  receivable: ReceivableEditRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReceivableEditModal({ isOpen, mode, receivable, onClose, onSaved }: ReceivableEditModalProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ReceivableStatus>("Pendente");
  const [patientId, setPatientId] = useState("");
  const [dentistId, setDentistId] = useState("");
  const [treatmentId, setTreatmentId] = useState("none");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [numeroParcela, setNumeroParcela] = useState("1");
  const [totalParcelas, setTotalParcelas] = useState("1");
  const [dataVencimento, setDataVencimento] = useState("");
  const [dataPagamento, setDataPagamento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const { data: options } = useQuery<ReceivableOptionsResponse>({
    queryKey: ["/api/receivables/options"],
    enabled: isOpen && mode === "edit",
  });
  const { data: treatments = [] } = useQuery<Treatment[]>({
    queryKey: ["/api/treatments/patient", patientId],
    enabled: isOpen && mode === "edit" && !!patientId,
  });
  const patients = options?.patients ?? [];
  const dentists = options?.dentists ?? [];

  useEffect(() => {
    if (!isOpen || !receivable) return;
    setStatus(receivable.status);
    setPatientId(receivable.patientId);
    setDentistId(receivable.dentistId);
    setTreatmentId(receivable.treatmentId ?? "none");
    setDescricao(receivable.descricao);
    setValor(mode === "installments"
      ? (parseFloat(receivable.valor) * receivable.totalParcelas).toFixed(2)
      : receivable.valor);
    setNumeroParcela(String(receivable.numeroParcela));
    setTotalParcelas(String(receivable.totalParcelas));
    setDataVencimento(receivable.dataVencimento.slice(0, 10));
    setDataPagamento(receivable.dataPagamento?.slice(0, 10) ?? "");
    setObservacoes(receivable.observacoes ?? "");
  }, [isOpen, mode, receivable]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!receivable) throw new Error("Título não selecionado");
      if (mode === "edit") {
        const response = await apiRequest("PATCH", `/api/receivables/${receivable.id}`, {
          patientId,
          dentistId,
          treatmentId: treatmentId === "none" ? null : treatmentId,
          descricao,
          status,
          valor: Number(valor),
          dataVencimento,
          dataPagamento: dataPagamento || null,
          numeroParcela: Number(numeroParcela),
          totalParcelas: Number(totalParcelas),
          observacoes,
        });
        return response.json();
      }
      const response = await apiRequest("POST", `/api/receivables/${receivable.id}/installments`, {
        valorTotal: Number(valor),
        totalParcelas: Number(totalParcelas),
        primeiraDataVencimento: dataVencimento,
      });
      return response.json();
    },
    onSuccess: (result) => {
      onSaved();
      toast({
        title: mode === "edit" ? "Título atualizado" : "Parcelas geradas",
        description: mode === "edit" ? "As alterações foram salvas." : `${result.length} nova(s) parcela(s) lançada(s).`,
      });
      onClose();
    },
    onError: (error: unknown) => {
      toast({
        title: "Não foi possível concluir a operação",
        description: error instanceof Error ? error.message : "Verifique os dados informados.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!patientId || !dentistId || !descricao.trim() || !Number.isFinite(Number(valor)) || Number(valor) <= 0 || !dataVencimento) {
      toast({ title: "Dados inválidos", description: "Preencha paciente, dentista, descrição, valor e vencimento.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(Number(totalParcelas)) || Number(totalParcelas) < 1 || Number(totalParcelas) > 12 || Number(numeroParcela) < 1 || Number(numeroParcela) > Number(totalParcelas)) {
      toast({ title: "Parcelamento inválido", description: "Escolha de 1 a 12 parcelas.", variant: "destructive" });
      return;
    }
    if (status === "Pago" && !dataPagamento) {
      toast({ title: "Data de pagamento obrigatória", description: "Informe a data de pagamento para um título pago.", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] overflow-auto p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Editar conta a receber" : "Gerar novas parcelas"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="min-w-[620px] space-y-4">
          {mode === "edit" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Paciente</Label>
                  <Select value={patientId} onValueChange={(value) => { setPatientId(value); setTreatmentId("none"); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                    <SelectContent>{patients.map((patient) => <SelectItem key={patient.id} value={patient.id}>{patient.fullName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dentista</Label>
                  <Select value={dentistId} onValueChange={setDentistId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o dentista" /></SelectTrigger>
                    <SelectContent>{dentists.map((dentist) => <SelectItem key={dentist.id} value={dentist.id}>{dentist.fullName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tratamento</Label>
                <Select value={treatmentId} onValueChange={setTreatmentId}>
                  <SelectTrigger><SelectValue placeholder="Sem tratamento vinculado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem tratamento vinculado</SelectItem>
                    {treatments.map((treatment) => <SelectItem key={treatment.id} value={treatment.id}>{treatment.tituloTratamento}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="receivable-description">Descrição</Label>
                <Input id="receivable-description" value={descricao} onChange={(event) => setDescricao(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receivable-status">Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as ReceivableStatus)}>
                  <SelectTrigger id="receivable-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pendente">Pendente</SelectItem>
                    <SelectItem value="Pago">Pago</SelectItem>
                    <SelectItem value="Vencido">Vencido</SelectItem>
                    <SelectItem value="Acordo">Acordo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="receivable-value">{mode === "edit" ? "Valor (R$)" : "Valor total (R$)"}</Label>
            <Input id="receivable-value" type="number" min="0.01" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="receivable-installment-number">Parcela</Label>
              <Input id="receivable-installment-number" type="number" min="1" max="12" value={numeroParcela} onChange={(event) => setNumeroParcela(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receivable-installments">Total de parcelas</Label>
              <Input id="receivable-installments" type="number" min="1" max="12" value={totalParcelas} onChange={(event) => setTotalParcelas(event.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receivable-due-date">{mode === "edit" ? "Vencimento" : "Vencimento da 1ª parcela"}</Label>
            <Input id="receivable-due-date" type="date" value={dataVencimento} onChange={(event) => setDataVencimento(event.target.value)} required />
          </div>
          {mode === "edit" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="receivable-payment-date">Data de pagamento</Label>
                <Input id="receivable-payment-date" type="date" value={dataPagamento} onChange={(event) => setDataPagamento(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receivable-notes">Observações</Label>
                <Textarea id="receivable-notes" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={2} />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Gerar parcelas"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}