import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Treatment, AnamnesisQuestion, AnamnesisResponse } from "@/types";

interface AnamnesisModalProps {
  isOpen: boolean;
  onClose: () => void;
  treatment: Treatment | null;
}

export default function AnamnesisModal({ isOpen, onClose, treatment }: AnamnesisModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [responses, setResponses] = useState<Record<string, { response: string; observations: string }>>({});

  // Fetch anamnesis questions
  const { data: questions = [] } = useQuery<AnamnesisQuestion[]>({
    queryKey: ["/api/anamnesis/questions"],
    enabled: isOpen,
    staleTime: 0, // Always fetch fresh data
  });


  // Fetch existing responses for this treatment
  const { data: existingResponses = [] } = useQuery<AnamnesisResponse[]>({
    queryKey: ["/api/anamnesis/responses/treatment", treatment?.id],
    enabled: isOpen && !!treatment,
  });

  useEffect(() => {
    if (existingResponses.length > 0) {
      const responseMap = existingResponses.reduce((acc, response) => {
        acc[response.questionId] = {
          response: response.response || "",
          observations: response.observations || "",
        };
        return acc;
      }, {} as Record<string, { response: string; observations: string }>);
      setResponses(responseMap);
    }
  }, [existingResponses]);

  const saveResponsesMutation = useMutation({
    mutationFn: async () => {
      if (!treatment) throw new Error("Treatment is required");

      const responsesToSave = Object.entries(responses).map(([questionId, data]) => ({
        treatmentId: treatment.id,
        patientId: treatment.patientId,
        questionId,
        response: data.response,
      }));

      // Send all responses in a single request
      await apiRequest("POST", "/api/anamnesis/responses", { responses: responsesToSave });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis/responses/treatment", treatment?.id] });
      toast({
        title: "Anamnese salva",
        description: "Respostas da anamnese salvas com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao salvar anamnese",
        description: "Não foi possível salvar as respostas da anamnese",
        variant: "destructive",
      });
    },
  });

  const clearResponsesMutation = useMutation({
    mutationFn: async () => {
      if (!treatment) throw new Error("Treatment is required");
      
      // Send array with one empty response to trigger delete of existing responses
      await apiRequest("POST", "/api/anamnesis/responses", { 
        responses: [{ treatmentId: treatment.id, questionId: "", response: "", patientId: treatment.patientId }] 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis/responses/treatment", treatment?.id] });
      setResponses({}); // Clear local state
      toast({
        title: "Respostas removidas",
        description: "Todas as respostas da anamnese foram removidas",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao limpar respostas",
        description: "Não foi possível remover as respostas da anamnese",
        variant: "destructive",
      });
    },
  });

  const handleResponseChange = (questionId: string, response: string) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        response,
      },
    }));
  };

  const handleObservationChange = (questionId: string, observations: string) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        observations,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveResponsesMutation.mutate();
  };

  const handleClearResponses = () => {
    if (window.confirm("Tem certeza que deseja apagar todas as respostas desta anamnese? Esta ação não pode ser desfeita.")) {
      clearResponsesMutation.mutate();
    }
  };

  if (!treatment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Anamnese - {treatment.tituloTratamento}</DialogTitle>
        </DialogHeader>

        {/* Check if there are existing responses to show clear button */}
        {Object.keys(responses).length > 0 && (
          <div className="flex justify-end border-b pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClearResponses}
              disabled={clearResponsesMutation.isPending}
              className="text-red-600 border-red-300 hover:bg-red-50"
              data-testid="button-clear-anamnesis"
            >
              {clearResponsesMutation.isPending ? "Limpando..." : "Limpar Respostas"}
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {questions.length > 0 ? (
                questions.map((question) => (
                  <div key={question.id} className="space-y-3 p-4 border rounded-lg">
                    <h3 className="font-medium text-sm">{question.question}</h3>
                    
                    <RadioGroup
                      value={responses[question.id]?.response || ""}
                      onValueChange={(value) => handleResponseChange(question.id, value)}
                      className="flex space-x-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Sim" id={`${question.id}-sim`} />
                        <Label htmlFor={`${question.id}-sim`} className="text-sm">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Não" id={`${question.id}-nao`} />
                        <Label htmlFor={`${question.id}-nao`} className="text-sm">Não</Label>
                      </div>
                    </RadioGroup>

                    <div className="space-y-2">
                      <Label htmlFor={`obs-${question.id}`} className="text-sm">
                        Observações (opcional)
                      </Label>
                      <Textarea
                        id={`obs-${question.id}`}
                        value={responses[question.id]?.observations || ""}
                        onChange={(e) => handleObservationChange(question.id, e.target.value)}
                        placeholder="Adicione observações sobre esta pergunta..."
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <p>Nenhuma pergunta cadastrada</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={saveResponsesMutation.isPending}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={saveResponsesMutation.isPending}
              data-testid="button-save-anamnesis"
            >
              {saveResponsesMutation.isPending ? "Salvando..." : "Salvar Anamnese"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}