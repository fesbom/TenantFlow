import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageSquare, 
  User, 
  Bot, 
  Send, 
  RefreshCw, 
  UserCheck, 
  Sparkles,
  Phone,
  Clock,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WhatsappConversation, WhatsappMessage } from "@shared/schema";

export default function Support() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const { toast } = useToast();

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<(WhatsappConversation & { patientName?: string | null })[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: conversationData, isLoading: messagesLoading } = useQuery<{
    conversation: WhatsappConversation;
    messages: WhatsappMessage[];
  }>({
    queryKey: ["/api/conversations", selectedConversationId, "messages"],
    enabled: !!selectedConversationId,
  });

  const takeoverMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return apiRequest("PATCH", `/api/conversations/${conversationId}/status`, { status: "human" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Conversa assumida com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao assumir conversa", variant: "destructive" });
    },
  });

  const returnToAiMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return apiRequest("PATCH", `/api/conversations/${conversationId}/status`, { status: "ai" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Conversa devolvida à IA" });
    },
    onError: () => {
      toast({ title: "Erro ao devolver conversa", variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string; message: string }) => {
      return apiRequest("POST", `/api/whatsapp/conversations/${conversationId}/send`, { message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversationId, "messages"] });
      setMessageText("");
      toast({ title: "Mensagem enviada" });
    },
    onError: () => {
      toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    },
  });

  const handleSendMessage = () => {
    if (!selectedConversationId || !messageText.trim()) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      message: messageText.trim(),
    });
  };

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  return (
    <div className="app-container bg-slate-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      
      <div className="main-content">
        <Header title="Atendimento IA" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6 flex-grow">
          <div className="mb-6">
            <p className="text-gray-600">
              Gerencie conversas do WhatsApp com pacientes
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5" />
                  Conversas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-320px)]">
                  {conversationsLoading ? (
                    <div className="p-4 text-center text-gray-500">Carregando...</div>
                  ) : conversations.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      Nenhuma conversa encontrada
                    </div>
                  ) : (
                    <div className="space-y-1 p-2">
                      {conversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          onClick={() => setSelectedConversationId(conversation.id)}
                          className={`w-full text-left p-3 rounded-lg transition-colors ${
                            selectedConversationId === conversation.id
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-gray-100"
                          }`}
                          data-testid={`conversation-item-${conversation.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-gray-400" />
                              <span className="font-medium text-sm">
                                {conversation.phone}
                              </span>
                            </div>
                            <Badge
                              variant={conversation.status === "ai" ? "secondary" : "default"}
                              className="text-xs"
                            >
                              {conversation.status === "ai" ? (
                                <><Bot className="h-3 w-3 mr-1" /> IA</>
                              ) : (
                                <><UserCheck className="h-3 w-3 mr-1" /> Humano</>
                              )}
                            </Badge>
                          </div>
                          {conversation.patientName ? (
                            <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                              <UserCheck className="h-3 w-3" />
                              {conversation.patientName}
                            </div>
                          ) : !conversation.patientId ? (
                            <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              Contato não vinculado
                            </div>
                          ) : null}
                          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            {conversation.lastMessageAt
                              ? format(new Date(conversation.lastMessageAt), "dd/MM HH:mm", { locale: ptBR })
                              : "Sem mensagens"}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 flex flex-col">
              {selectedConversationId ? (
                <>
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">
                            {(selectedConversation as any)?.patientName || selectedConversation?.phone}
                          </h3>
                          {!selectedConversation?.patientId && (
                            <p className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Contato não vinculado a um paciente cadastrado
                            </p>
                          )}
                          <p className="text-sm text-gray-500">
                            {selectedConversation?.patientId ? selectedConversation?.phone + " · " : ""}
                            {selectedConversation?.status === "ai" ? "Atendimento IA" : "Atendimento Humano"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedConversation?.status === "ai" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => takeoverMutation.mutate(selectedConversationId)}
                            disabled={takeoverMutation.isPending}
                            data-testid="button-takeover"
                          >
                            <UserCheck className="h-4 w-4 mr-2" />
                            Assumir
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => returnToAiMutation.mutate(selectedConversationId)}
                            disabled={returnToAiMutation.isPending}
                            data-testid="button-return-to-ai"
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Devolver à IA
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/conversations"] })}
                          data-testid="button-refresh"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-[calc(100vh-450px)] p-4">
                      {messagesLoading ? (
                        <div className="text-center text-gray-500">Carregando mensagens...</div>
                      ) : (
                        <div className="space-y-4">
                          {conversationData?.messages.map((message) => (
                            <div
                              key={message.id}
                              className={`flex ${
                                message.sender === "patient" ? "justify-start" : "justify-end"
                              }`}
                            >
                              <div
                                className={`max-w-[70%] p-3 rounded-lg ${
                                  message.sender === "patient"
                                    ? "bg-gray-100 text-gray-900"
                                    : message.sender === "ai"
                                    ? "bg-purple-100 text-purple-900"
                                    : "bg-primary text-white"
                                }`}
                                data-testid={`message-${message.id}`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {message.sender === "patient" ? (
                                    <User className="h-3 w-3" />
                                  ) : message.sender === "ai" ? (
                                    <Bot className="h-3 w-3" />
                                  ) : (
                                    <UserCheck className="h-3 w-3" />
                                  )}
                                  <span className="text-xs opacity-75">
                                    {message.sender === "patient"
                                      ? "Paciente"
                                      : message.sender === "ai"
                                      ? "IA"
                                      : "Atendente"}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                <p className="text-xs opacity-50 mt-1 text-right">
                                  {format(new Date(message.createdAt!), "HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>

                  {selectedConversation?.status === "human" && (
                    <div className="p-4 border-t">
                      <div className="flex gap-2">
                        <Input
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          placeholder="Digite sua mensagem..."
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                          data-testid="input-message"
                        />
                        <Button
                          onClick={handleSendMessage}
                          disabled={sendMessageMutation.isPending || !messageText.trim()}
                          data-testid="button-send"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Selecione uma conversa para visualizar</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
