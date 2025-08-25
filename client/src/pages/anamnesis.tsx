import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { AnamnesisQuestion } from "@/types";
import { Plus, Edit, Trash2, ClipboardList } from "lucide-react";

export default function Anamnesis() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<AnamnesisQuestion | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    question: "",
    type: "text" as "text" | "boolean" | "multiple_choice",
    options: "",
    isRequired: false,
  });

  // Fetch anamnesis questions
  const { data: questions = [], isLoading } = useQuery<AnamnesisQuestion[]>({
    queryKey: ["/api/anamnesis/questions"],
  });

  // Create question mutation
  const createQuestionMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/anamnesis/questions", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis/questions"] });
      toast({
        title: "Pergunta criada",
        description: "Pergunta de anamnese criada com sucesso",
      });
      resetForm();
    },
    onError: () => {
      toast({
        title: "Erro ao criar pergunta",
        description: "Não foi possível criar a pergunta",
        variant: "destructive",
      });
    },
  });

  // Update question mutation
  const updateQuestionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PUT", `/api/anamnesis/questions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis/questions"] });
      toast({
        title: "Pergunta atualizada",
        description: "Pergunta de anamnese atualizada com sucesso",
      });
      resetForm();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar pergunta",
        description: "Não foi possível atualizar a pergunta",
        variant: "destructive",
      });
    },
  });

  // Delete question mutation
  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      await apiRequest("DELETE", `/api/anamnesis/questions/${questionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis/questions"] });
      toast({
        title: "Pergunta removida",
        description: "Pergunta de anamnese removida com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao remover pergunta",
        description: "Não foi possível remover a pergunta",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      question: "",
      type: "text",
      options: "",
      isRequired: false,
    });
    setIsCreating(false);
    setEditingQuestion(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingQuestion) {
      updateQuestionMutation.mutate({ id: editingQuestion.id, data: formData });
    } else {
      createQuestionMutation.mutate(formData);
    }
  };

  const handleEdit = (question: AnamnesisQuestion) => {
    setEditingQuestion(question);
    setFormData({
      question: question.question,
      type: question.type as "text" | "boolean" | "multiple_choice",
      options: question.options || "",
      isRequired: question.isRequired,
    });
    setIsCreating(true);
  };

  const handleDelete = async (questionId: string) => {
    if (window.confirm("Tem certeza que deseja remover esta pergunta?")) {
      deleteQuestionMutation.mutate(questionId);
    }
  };

  const getTypeLabel = (type: string) => {
    const types = {
      text: "Texto",
      boolean: "Sim/Não",
      multiple_choice: "Múltipla Escolha",
    };
    return types[type as keyof typeof types] || type;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      
      <div 
        className={`flex-1 w-full ${
          sidebarExpanded ? "main-content-expanded" : "main-content-collapsed"
        }`}
        data-sidebar-state={sidebarExpanded ? "expanded" : "collapsed"}
        style={{
          marginLeft: sidebarExpanded ? '256px' : '80px',
          transition: 'margin-left 0.3s ease-in-out'
        }}
      >
        <Header title="Anamnese" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6 w-full max-w-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Question Form */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {editingQuestion ? "Editar Pergunta" : "Nova Pergunta"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isCreating || editingQuestion ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="question">Pergunta *</Label>
                        <Textarea
                          id="question"
                          value={formData.question}
                          onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                          placeholder="Digite a pergunta da anamnese"
                          required
                          rows={3}
                          data-testid="textarea-question"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="type">Tipo de Resposta</Label>
                        <Select
                          value={formData.type}
                          onValueChange={(value: "text" | "boolean" | "multiple_choice") =>
                            setFormData({ ...formData, type: value })
                          }
                        >
                          <SelectTrigger data-testid="select-question-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="boolean">Sim/Não</SelectItem>
                            <SelectItem value="multiple_choice">Múltipla Escolha</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.type === "multiple_choice" && (
                        <div className="space-y-2">
                          <Label htmlFor="options">Opções (separadas por vírgula)</Label>
                          <Textarea
                            id="options"
                            value={formData.options}
                            onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                            placeholder="Opção 1, Opção 2, Opção 3"
                            rows={3}
                            data-testid="textarea-options"
                          />
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="required"
                          checked={formData.isRequired}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, isRequired: checked })
                          }
                          data-testid="switch-required"
                        />
                        <Label htmlFor="required">Pergunta obrigatória</Label>
                      </div>

                      <div className="flex space-x-2">
                        <Button
                          type="submit"
                          disabled={createQuestionMutation.isPending || updateQuestionMutation.isPending}
                          data-testid="button-save-question"
                        >
                          {editingQuestion ? "Atualizar" : "Criar"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={resetForm}
                          data-testid="button-cancel-question"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-center py-8">
                      <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-gray-500 mb-4">
                        Configure as perguntas da anamnese para sua clínica
                      </p>
                      <Button
                        onClick={() => setIsCreating(true)}
                        data-testid="button-add-question"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Pergunta
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Questions List */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Perguntas Configuradas</CardTitle>
                    {!isCreating && !editingQuestion && (
                      <Button
                        onClick={() => setIsCreating(true)}
                        data-testid="button-new-question"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Pergunta
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center py-8 text-gray-500">
                      Carregando perguntas...
                    </div>
                  ) : questions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Nenhuma pergunta configurada</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pergunta</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Obrigatória</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {questions.map((question) => (
                            <TableRow key={question.id} data-testid={`question-${question.id}`}>
                              <TableCell className="max-w-md">
                                <div className="break-words">{question.question}</div>
                                {question.type === "multiple_choice" && question.options && (
                                  <div className="text-sm text-gray-500 mt-1">
                                    Opções: {question.options}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>{getTypeLabel(question.type)}</TableCell>
                              <TableCell>
                                {question.isRequired ? (
                                  <span className="text-red-600 font-medium">Sim</span>
                                ) : (
                                  <span className="text-gray-500">Não</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(question)}
                                    data-testid={`button-edit-question-${question.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(question.id)}
                                    className="text-red-600 hover:text-red-700"
                                    data-testid={`button-delete-question-${question.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
