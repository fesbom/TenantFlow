import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Save, RotateCcw } from "lucide-react";
import { BOOKING_MESSAGE_PLACEHOLDERS, DEFAULT_BOOKING_MESSAGE, renderBookingMessage } from "@shared/booking-message";

interface BookingMessageResponse {
  message: string | null;
  isDefault: boolean;
  defaultMessage: string;
}

export default function BookingMessageCard({ dentistId, dentistName }: { dentistId: string; dentistName?: string }) {
  const { toast } = useToast();
  const [text, setText] = useState(DEFAULT_BOOKING_MESSAGE);
  const [dirty, setDirty] = useState(false);
  const queryKey = ["/api/availability/booking-message", dentistId];

  const { data } = useQuery<BookingMessageResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/availability/booking-message/${dentistId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      return res.json();
    },
    enabled: !!dentistId,
  });

  useEffect(() => {
    if (!data) return;
    setText(data.message ?? data.defaultMessage ?? DEFAULT_BOOKING_MESSAGE);
    setDirty(false);
  }, [data, dentistId]);

  const saveMutation = useMutation({
    mutationFn: async (message: string) =>
      apiRequest("PUT", `/api/availability/booking-message/${dentistId}`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDirty(false);
      toast({ title: "Mensagem de confirmação salva" });
    },
    onError: () => toast({ title: "Erro ao salvar mensagem", variant: "destructive" }),
  });

  const preview = renderBookingMessage(text, {
    paciente: "Maria",
    dentista: dentistName ?? "Dr(a). Dentista",
    data: "15/10/2026",
    hora: "14:00",
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary" />
            Mensagem de Confirmação de Agendamento
            {dentistName && <span className="text-gray-400 font-normal">— {dentistName}</span>}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setText(DEFAULT_BOOKING_MESSAGE);
                setDirty(true);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar padrão
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate(text)} disabled={saveMutation.isPending || !dirty || !dentistId}>
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar Mensagem"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Enviada ao paciente quando a IA conclui um agendamento com este dentista. Variáveis disponíveis:{" "}
          {BOOKING_MESSAGE_PLACEHOLDERS.join(", ")}.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          rows={6}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
        />
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Pré-visualização</p>
          <div className="whitespace-pre-wrap rounded-lg bg-purple-50 border border-purple-100 p-3 text-sm text-purple-900">
            {preview}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
