import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  AlertTriangle,
  Search,
  Link2,
  UserPlus,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WhatsappConversation, WhatsappMessage } from "@shared/schema";

const CONVERSATIONS_POLL_INTERVAL = 5000;
const MESSAGES_POLL_INTERVAL = 3000;

export default function Support() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSearchDebounced, setLinkSearchDebounced] = useState("");
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<(WhatsappConversation & { patientName?: string | null })[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: CONVERSATIONS_POLL_INTERVAL,
  });

  const { data: conversationData, isLoading: messagesLoading } = useQuery<{
    conversation: WhatsappConversation;
    messages: WhatsappMessage[];
  }>({
    queryKey: ["/api/conversations", selectedConversationId, "messages"],
    enabled: !!selectedConversationId,
    refetchInterval: MESSAGES_POLL_INTERVAL,
  });

  // Debounce do campo de busca do modal de vínculo
  useEffect(() => {
    const t = setTimeout(() => setLinkSearchDebounced(linkSearch), 400);
    return () => clearTimeout(t);
  }, [linkSearch]);

  // Query de pacientes para o modal de vínculo
  const { data: linkPatientData } = useQuery<{ data: any[] }>({
    queryKey: ["/api/patients", { search: linkSearchDebounced, page: 1, pageSize: 10 }],
    queryFn: async ({ queryKey }) => {
      const [_key, params] = queryKey as [string, { search: string; page: number; pageSize: number }];
      const sp = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.search) sp.append("search", params.search);
      const res = await fetch(`${_key}?${sp}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      return res.json();
    },
    enabled: showLinkModal,
  });
  const linkPatients = linkPatientData?.data || [];

  // Mutation para vincular conversa a paciente
  const linkPatientMutation = useMutation({
    mutationFn: async ({ conversationId, patientId }: { conversationId: string; patientId: string }) => {
      return apiRequest("PATCH", `/api/conversations/${conversationId}/link-patient`, { patientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversationId, "messages"] });
      setShowLinkModal(false);
      setLinkSearch("");
      toast({ title: "Paciente vinculado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao vincular paciente", variant: "destructive" });
    },
  });

  const dedupedMessages = useMemo(() => {
    const msgs = conversationData?.messages || [];
    const seen = new Set<string>();
    return msgs.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [conversationData?.messages]);

  // Remove prefixos de identificação ([🤖 IA] ou [👤 Nome]) antes de exibir no chat
  const stripSenderPrefix = (text: string): string => {
    return text.replace(/^\[(?:🤖 IA|👤 [^\]]+)\]\s*/u, "");
  };

  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: typeof dedupedMessages }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const msg of dedupedMessages) {
      const msgDate = new Date(msg.createdAt!);
      const dayKey = format(msgDate, "yyyy-MM-dd");

      let label: string;
      if (format(today, "yyyy-MM-dd") === dayKey) {
        label = "Hoje";
      } else if (format(yesterday, "yyyy-MM-dd") === dayKey) {
        label = "Ontem";
      } else {
        label = format(msgDate, "d 'de' MMMM", { locale: ptBR });
      }

      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.messages.push(msg);
      } else {
        groups.push({ label, messages: [msg] });
      }
    }
    return groups;
  }, [dedupedMessages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const currentCount = dedupedMessages.length;
    if (currentCount > prevMessageCountRef.current) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
    prevMessageCountRef.current = currentCount;
  }, [dedupedMessages.length, scrollToBottom]);

  useEffect(() => {
    if (selectedConversationId) {
      setTimeout(() => scrollToBottom("auto"), 150);
    }
  }, [selectedConversationId, scrollToBottom]);

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
        
        <main className="p-4 lg:p-6 flex-grow overflow-hidden">
          <div className="mb-4">
            <p className="text-gray-600">
              Gerencie conversas do WhatsApp com pacientes
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-180px)]">

            <Card className="lg:col-span-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-3 shrink-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5" />
                  Conversas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-scroll scrollbar-visible">
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
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 flex flex-col overflow-hidden">
              {selectedConversationId ? (
                <>
                  <CardHeader className="pb-3 border-b shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium truncate">
                            {(selectedConversation as any)?.patientName || selectedConversation?.phone}
                          </h3>
                          {!selectedConversation?.patientId && (
                            <button
                              onClick={() => { setShowLinkModal(true); setLinkSearch(""); }}
                              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 hover:underline transition-colors"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Número não identificado. Clique para vincular a um paciente
                            </button>
                          )}
                          <p className="text-sm text-gray-500">
                            {selectedConversation?.patientId ? selectedConversation?.phone + " · " : ""}
                            {selectedConversation?.status === "ai" ? "Atendimento IA" : "Atendimento Humano"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
                          onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversationId, "messages"] });
                          }}
                          data-testid="button-refresh"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <div
                      ref={messagesContainerRef}
                      className="flex-1 overflow-y-scroll bg-slate-50/80 border-y border-slate-200/60 p-4 messages-scroll"
                    >
                      {messagesLoading ? (
                        <div className="flex items-center justify-center h-full text-gray-500">Carregando mensagens...</div>
                      ) : dedupedMessages.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-gray-400">
                          <div className="text-center">
                            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Nenhuma mensagem ainda</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {groupedMessages.map((group) => (
                            <div key={group.label}>
                              {/* Separador de Data */}
                              <div className="flex items-center gap-3 my-4">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-[11px] font-medium text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full select-none">
                                  {group.label}
                                </span>
                                <div className="flex-1 h-px bg-slate-200" />
                              </div>

                              {group.messages.map((message) => (
                                <div
                                  key={message.id}
                                  className={`flex mb-2 ${
                                    message.direction === "inbound" || message.sender === "patient" ? "justify-start" : "justify-end"
                                  }`}
                                >
                                  <div
                                    className={`max-w-[75%] p-3 rounded-2xl shadow-sm ${
                                      message.direction === "inbound" || message.sender === "patient"
                                        ? "bg-white text-gray-900 border border-gray-200/80 rounded-bl-md"
                                        : message.sender === "ai"
                                        ? "bg-purple-100 text-purple-900 border border-purple-200/60 rounded-br-md"
                                        : "bg-primary text-white rounded-br-md"
                                    }`}
                                    data-testid={`message-${message.id}`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      {message.sender === "patient" ? (
                                        <User className="h-3 w-3 opacity-60" />
                                      ) : message.sender === "ai" ? (
                                        <Bot className="h-3 w-3 opacity-60" />
                                      ) : (
                                        <UserCheck className="h-3 w-3 opacity-60" />
                                      )}
                                      <span className="text-xs font-medium opacity-70">
                                        {message.sender === "patient"
                                          ? "Paciente"
                                          : message.sender === "ai"
                                          ? "🤖 IA"
                                          : "👤 Humano"}
                                      </span>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{stripSenderPrefix(message.text || "")}</p>
                                    <p className="text-[10px] opacity-40 mt-1.5 text-right">
                                      {format(new Date(message.createdAt!), "HH:mm", { locale: ptBR })}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedConversation?.status === "human" && (
                    <div className="p-3 border-t bg-white shrink-0">
                      <div className="flex gap-2">
                        <Input
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          placeholder="Digite sua mensagem..."
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                          className="flex-1"
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

      {/* Modal de Vínculo de Paciente */}
      <Dialog open={showLinkModal} onOpenChange={(open) => { setShowLinkModal(open); if (!open) setLinkSearch(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Vincular número a um paciente
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Botão Novo Paciente */}
            <Button
              variant="outline"
              className="w-full border-dashed border-primary/50 text-primary hover:bg-primary/5"
              onClick={() => {
                const phone = selectedConversation?.phone?.replace(/\D/g, "") || "";
                const name = (conversationData?.messages?.find(m => m.sender === "patient")?.text || "");
                const params = new URLSearchParams();
                if (phone) params.set("phone", phone);
                window.location.href = `/patients?${params.toString()}`;
              }}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Novo — Cadastrar paciente com este número
            </Button>

            {/* Campo de Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Buscar por nome, CPF ou telefone..."
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Lista de Pacientes */}
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {linkPatients.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">
                  {linkSearchDebounced ? "Nenhum paciente encontrado" : "Digite para buscar pacientes"}
                </p>
              ) : (
                linkPatients.map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.fullName}</p>
                      <p className="text-xs text-gray-500 truncate">{p.phone}{p.email ? " · " + p.email : ""}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (selectedConversationId) {
                          linkPatientMutation.mutate({ conversationId: selectedConversationId, patientId: p.id });
                        }
                      }}
                      disabled={linkPatientMutation.isPending}
                      className="shrink-0 ml-2"
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Associar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
