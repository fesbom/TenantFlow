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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
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
  CheckCircle,
  Timer,
  Hourglass,
  XCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WhatsappConversation, WhatsappMessage } from "@shared/schema";

const CONVERSATIONS_POLL_INTERVAL = 5000;
const MESSAGES_POLL_INTERVAL = 3000;
const AUTO_CLOSE_MS = 2 * 60 * 60 * 1000; // 2 horas

type FilterTab = "all" | "waiting_staff" | "waiting_patient" | "closed";

type ConversationWithPatient = WhatsappConversation & {
  patientName?: string | null;
  lastMessageSender?: string | null;
};

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
function getConvDerivedStatus(conv: ConversationWithPatient): "waiting_staff" | "waiting_patient" | "closed" {
  if (conv.status === "closed") return "closed";
  if (conv.lastMessageSender === "patient") return "waiting_staff";
  return "waiting_patient";
}

function elapsedMs(dateStr: string | Date | null | undefined): number {
  if (!dateStr) return 0;
  return Date.now() - new Date(dateStr).getTime();
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}min` : `${hrs}h`;
}

function autoClosePercent(conv: ConversationWithPatient): number {
  if (getConvDerivedStatus(conv) !== "waiting_patient") return 0;
  const elapsed = elapsedMs(conv.lastMessageAt);
  return Math.min(100, Math.round((elapsed / AUTO_CLOSE_MS) * 100));
}

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────
export default function Support() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSearchDebounced, setLinkSearchDebounced] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [convSearch, setConvSearch] = useState("");
  const [convSearchDebounced, setConvSearchDebounced] = useState("");
  const [, setTick] = useState(0); // força re-render para timers ao vivo
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  // Rastreia o lastMessageAt de cada conversa vista no poll anterior
  const prevConvsRef = useRef<Map<string, string>>(new Map());
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Timer ao vivo — re-renderiza a cada 30s para atualizar contadores
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ConversationWithPatient[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: CONVERSATIONS_POLL_INTERVAL,
  });

  // ── Detecta novas mensagens de pacientes entre polls ─────────────────
  useEffect(() => {
    if (conversations.length === 0) return;

    const newFlash = new Set<string>();

    for (const conv of conversations) {
      const prevAt = prevConvsRef.current.get(conv.id);
      const currAt = conv.lastMessageAt ? String(conv.lastMessageAt) : "";

      // Nova mensagem de paciente detectada (lastMessageAt mudou e remetente é 'patient')
      if (
        prevAt !== undefined &&          // conversa já conhecida (não a primeira carga)
        prevAt !== currAt &&             // timestamp mudou
        conv.lastMessageSender === "patient" &&
        conv.id !== selectedConversationId  // não pisca a conversa aberta
      ) {
        newFlash.add(conv.id);
      }

      // Atualiza referência
      prevConvsRef.current.set(conv.id, currAt);
    }

    if (newFlash.size > 0) {
      setFlashedIds((prev) => {
        const next = new Set(prev);
        for (const id of newFlash) {
          next.add(id);
          // Remove o flash após 3s (cancela timer anterior se houver)
          const existing = flashTimersRef.current.get(id);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            setFlashedIds((s) => {
              const ns = new Set(s);
              ns.delete(id);
              return ns;
            });
            flashTimersRef.current.delete(id);
          }, 3000);
          flashTimersRef.current.set(id, timer);
        }
        return next;
      });
    }
  }, [conversations, selectedConversationId]);

  const { data: conversationData, isLoading: messagesLoading } = useQuery<{
    conversation: WhatsappConversation;
    messages: WhatsappMessage[];
  }>({
    queryKey: ["/api/conversations", selectedConversationId, "messages"],
    enabled: !!selectedConversationId,
    refetchInterval: MESSAGES_POLL_INTERVAL,
  });

  // Debounce busca de conversas
  useEffect(() => {
    const t = setTimeout(() => setConvSearchDebounced(convSearch), 300);
    return () => clearTimeout(t);
  }, [convSearch]);

  // Debounce busca modal
  useEffect(() => {
    const t = setTimeout(() => setLinkSearchDebounced(linkSearch), 400);
    return () => clearTimeout(t);
  }, [linkSearch]);

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

  // ── Mutations ────────────────────────────────────────────────────────
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
    onError: () => toast({ title: "Erro ao vincular paciente", variant: "destructive" }),
  });

  const takeoverMutation = useMutation({
    mutationFn: async (conversationId: string) =>
      apiRequest("PATCH", `/api/conversations/${conversationId}/status`, { status: "human" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Conversa assumida com sucesso" });
    },
    onError: () => toast({ title: "Erro ao assumir conversa", variant: "destructive" }),
  });

  const returnToAiMutation = useMutation({
    mutationFn: async (conversationId: string) =>
      apiRequest("PATCH", `/api/conversations/${conversationId}/status`, { status: "ai" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Conversa devolvida à IA" });
    },
    onError: () => toast({ title: "Erro ao devolver conversa", variant: "destructive" }),
  });

  const closeConversationMutation = useMutation({
    mutationFn: async (conversationId: string) =>
      apiRequest("POST", `/api/conversations/${conversationId}/close`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversationId, "messages"] });
      setShowCloseConfirm(false);
      toast({ title: "Conversa encerrada com sucesso" });
    },
    onError: () => {
      setShowCloseConfirm(false);
      toast({ title: "Erro ao encerrar conversa", variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string; message: string }) =>
      apiRequest("POST", `/api/whatsapp/conversations/${conversationId}/send`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversationId, "messages"] });
      setMessageText("");
    },
    onError: () => toast({ title: "Erro ao enviar mensagem", variant: "destructive" }),
  });

  // ── Messages dedup / strip / group ───────────────────────────────────
  const dedupedMessages = useMemo(() => {
    const msgs = conversationData?.messages || [];
    const seen = new Set<string>();
    return msgs.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [conversationData?.messages]);

  const stripSenderPrefix = (text: string): string =>
    text.replace(/^\[(?:🤖 IA|👤 [^\]]+)\]\s*/u, "");

  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: typeof dedupedMessages }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const msg of dedupedMessages) {
      const msgDate = new Date(msg.createdAt!);
      const dayKey = format(msgDate, "yyyy-MM-dd");
      let label: string;
      if (format(today, "yyyy-MM-dd") === dayKey) label = "Hoje";
      else if (format(yesterday, "yyyy-MM-dd") === dayKey) label = "Ontem";
      else label = format(msgDate, "d 'de' MMMM", { locale: ptBR });

      const last = groups[groups.length - 1];
      if (last && last.label === label) last.messages.push(msg);
      else groups.push({ label, messages: [msg] });
    }
    return groups;
  }, [dedupedMessages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current)
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    const currentCount = dedupedMessages.length;
    if (currentCount > prevMessageCountRef.current)
      requestAnimationFrame(() => scrollToBottom("smooth"));
    prevMessageCountRef.current = currentCount;
  }, [dedupedMessages.length, scrollToBottom]);

  useEffect(() => {
    if (selectedConversationId) setTimeout(() => scrollToBottom("auto"), 150);
  }, [selectedConversationId, scrollToBottom]);

  // ── Filtered + sorted conversations ──────────────────────────────────
  // Ordem: waiting_staff (urgente) > waiting_patient > closed
  // Dentro de cada grupo: mais recente primeiro (lastMessageAt desc)
  const filteredConversations = useMemo(() => {
    const urgencyOrder: Record<string, number> = { waiting_staff: 0, waiting_patient: 1, closed: 2 };
    const q = convSearchDebounced.trim().toLowerCase();

    return conversations
      .filter((conv) => {
        // Quando busca ativa: pesquisa em TODAS as conversas (ignora tab), incluindo encerradas
        if (q) {
          const name = ((conv as any).patientName || "").toLowerCase();
          const phone = (conv.phone || "").toLowerCase();
          return name.includes(q) || phone.includes(q);
        }
        // Sem busca: aplica filtro de tab normalmente
        const derived = getConvDerivedStatus(conv);
        if (filterTab === "all") return true;
        return derived === filterTab;
      })
      .sort((a, b) => {
        const da = getConvDerivedStatus(a);
        const db = getConvDerivedStatus(b);
        if (da !== db) return (urgencyOrder[da] ?? 9) - (urgencyOrder[db] ?? 9);
        // Mesmo grupo: mais recente primeiro
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });
  }, [conversations, filterTab, convSearchDebounced]);

  // Contadores para os tabs
  const counts = useMemo(() => ({
    all: conversations.length,
    waiting_staff: conversations.filter((c) => getConvDerivedStatus(c) === "waiting_staff").length,
    waiting_patient: conversations.filter((c) => getConvDerivedStatus(c) === "waiting_patient").length,
    closed: conversations.filter((c) => getConvDerivedStatus(c) === "closed").length,
  }), [conversations]);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const handleSendMessage = () => {
    if (!selectedConversationId || !messageText.trim()) return;
    sendMessageMutation.mutate({ conversationId: selectedConversationId, message: messageText.trim() });
  };

  // ── Status badge para o card ─────────────────────────────────────────
  const ConvStatusBadge = ({ conv }: { conv: ConversationWithPatient }) => {
    const derived = getConvDerivedStatus(conv);
    if (derived === "closed")
      return <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-500"><CheckCircle className="h-3 w-3 mr-1" />Concluído</Badge>;
    if (derived === "waiting_staff")
      return <Badge variant="destructive" className="text-xs"><Hourglass className="h-3 w-3 mr-1" />Aguardando</Badge>;
    // waiting_patient
    if (conv.status === "ai")
      return <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700"><Bot className="h-3 w-3 mr-1" />IA</Badge>;
    return <Badge variant="default" className="text-xs"><UserCheck className="h-3 w-3 mr-1" />Humano</Badge>;
  };

  // ── Elapsed / progress no card ───────────────────────────────────────
  const ConvTimeInfo = ({ conv }: { conv: ConversationWithPatient }) => {
    const derived = getConvDerivedStatus(conv);
    const ms = elapsedMs(conv.lastMessageAt);
    const elapsed = formatElapsed(ms);
    const pct = autoClosePercent(conv);

    if (derived === "closed") {
      return (
        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          Encerrado {conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { locale: ptBR, addSuffix: true }) : ""}
        </div>
      );
    }

    if (derived === "waiting_staff") {
      return (
        <div className="flex items-center gap-1 mt-1 text-xs text-red-500 font-medium">
          <Timer className="h-3 w-3" />
          Aguardando há {elapsed}
        </div>
      );
    }

    // waiting_patient — mostra barra de progresso de 2h
    const barColor = pct >= 75 ? "bg-orange-400" : pct >= 50 ? "bg-yellow-400" : "bg-emerald-400";
    return (
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Respondido há {elapsed}</span>
          <span className={`text-xs font-medium ${pct >= 75 ? "text-orange-500" : "text-gray-400"}`}>
            {pct}% de 2h
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`${barColor} h-1.5 rounded-full transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  // ── TABS de filtro ────────────────────────────────────────────────────
  const TABS: { key: FilterTab; label: string; icon: any; color: string }[] = [
    { key: "all", label: "Todos", icon: MessageSquare, color: "text-gray-600" },
    { key: "waiting_staff", label: "Aguardando Atendimento", icon: Hourglass, color: "text-red-500" },
    { key: "waiting_patient", label: "Aguardando Cliente", icon: Clock, color: "text-gray-500" },
    { key: "closed", label: "Concluídos", icon: CheckCircle, color: "text-green-500" },
  ];

  return (
    <div className="app-container bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isExpanded={sidebarExpanded} onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="main-content">
        <Header title="Atendimento" onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 lg:p-6 flex-grow overflow-hidden">
          <div className="mb-4">
            <p className="text-gray-600">Gerencie conversas do WhatsApp com pacientes</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-180px)]">

            {/* ── LISTA DE CONVERSAS ─────────────────────────────── */}
            <Card className="lg:col-span-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5" />
                  Conversas
                </CardTitle>

                {/* Campo de busca */}
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    value={convSearch}
                    onChange={(e) => setConvSearch(e.target.value)}
                    placeholder="Buscar por nome ou telefone..."
                    className="pl-8 pr-8 h-8 text-xs"
                  />
                  {convSearch && (
                    <button
                      onClick={() => setConvSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Indicador de busca ativa */}
                {convSearchDebounced && (
                  <p className="text-xs text-primary font-medium mt-1">
                    {filteredConversations.length} resultado{filteredConversations.length !== 1 ? "s" : ""} encontrado{filteredConversations.length !== 1 ? "s" : ""} (incluindo encerradas)
                  </p>
                )}

                {/* Filtro por status (oculto durante busca) */}
                {!convSearchDebounced && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setFilterTab(tab.key)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors border ${
                          filterTab === tab.key
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <tab.icon className="h-3 w-3" />
                        {tab.label}
                        <span className={`ml-0.5 text-[10px] px-1 rounded-full ${filterTab === tab.key ? "bg-white/20" : "bg-gray-100"}`}>
                          {counts[tab.key]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-scroll scrollbar-visible">
                  {conversationsLoading ? (
                    <div className="p-4 text-center text-gray-500">Carregando...</div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      Nenhuma conversa nesta categoria
                    </div>
                  ) : (
                    <div className="space-y-1 p-2">
                      {filteredConversations.map((conversation) => {
                        const derived = getConvDerivedStatus(conversation);
                        const isFlashing = flashedIds.has(conversation.id);
                        return (
                          <button
                            key={conversation.id}
                            onClick={() => {
                              setSelectedConversationId(conversation.id);
                              // Remove flash ao abrir a conversa
                              setFlashedIds((s) => { const ns = new Set(s); ns.delete(conversation.id); return ns; });
                            }}
                            className={`w-full text-left p-3 rounded-lg transition-all duration-300 ${
                              isFlashing
                                ? "bg-red-50 border-2 border-red-400 ring-2 ring-red-300 ring-offset-1 animate-pulse"
                                : selectedConversationId === conversation.id
                                ? "bg-primary/10 border border-primary/20"
                                : derived === "waiting_staff"
                                ? "hover:bg-red-50 border border-red-100/60"
                                : derived === "closed"
                                ? "hover:bg-gray-50 opacity-70"
                                : "hover:bg-gray-100"
                            }`}
                            data-testid={`conversation-item-${conversation.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                                <span className="font-medium text-sm truncate">
                                  {(conversation as any).patientName || conversation.phone}
                                </span>
                              </div>
                              <ConvStatusBadge conv={conversation} />
                            </div>

                            {/* Nome do paciente (subtítulo) quando patientName é exibido acima */}
                            {(conversation as any).patientName && (
                              <div className="text-xs text-gray-400 mt-0.5 truncate pl-6">{conversation.phone}</div>
                            )}

                            {!conversation.patientId && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                                <AlertTriangle className="h-3 w-3" />
                                Contato não vinculado
                              </div>
                            )}

                            <ConvTimeInfo conv={conversation} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── PAINEL DE CHAT ─────────────────────────────────── */}
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
                            {selectedConversation?.status === "ai"
                              ? "Atendimento IA"
                              : selectedConversation?.status === "human"
                              ? "Atendimento Humano"
                              : "Encerrado"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {selectedConversation?.status === "ai" && (
                          <Button variant="outline" size="sm" onClick={() => takeoverMutation.mutate(selectedConversationId)} disabled={takeoverMutation.isPending} data-testid="button-takeover">
                            <UserCheck className="h-4 w-4 mr-2" /> Assumir
                          </Button>
                        )}
                        {selectedConversation?.status === "human" && (
                          <Button variant="outline" size="sm" onClick={() => returnToAiMutation.mutate(selectedConversationId)} disabled={returnToAiMutation.isPending} data-testid="button-return-to-ai">
                            <Sparkles className="h-4 w-4 mr-2" /> Devolver à IA
                          </Button>
                        )}
                        {selectedConversation?.status !== "closed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCloseConfirm(true)}
                            disabled={closeConversationMutation.isPending}
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400"
                            data-testid="button-close-conversation"
                          >
                            <XCircle className="h-4 w-4 mr-2" /> Encerrar
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/conversations"] }); queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversationId, "messages"] }); }} data-testid="button-refresh">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Barra de progresso no header do chat ativo */}
                    {selectedConversation && getConvDerivedStatus(selectedConversation as ConversationWithPatient) === "waiting_patient" && (
                      <div className="mt-2 space-y-1">
                        {(() => {
                          const pct = autoClosePercent(selectedConversation as ConversationWithPatient);
                          const ms = elapsedMs(selectedConversation.lastMessageAt);
                          const remaining = Math.max(0, AUTO_CLOSE_MS - ms);
                          const remMin = Math.ceil(remaining / 60_000);
                          return (
                            <>
                              <div className="flex justify-between text-xs text-gray-400">
                                <span>Encerramento automático em {remMin > 60 ? `${Math.ceil(remMin / 60)}h` : `${remMin}min`}</span>
                                <span className={pct >= 75 ? "text-orange-500 font-medium" : ""}>{pct}%</span>
                              </div>
                              <Progress value={pct} className={`h-1.5 ${pct >= 75 ? "[&>div]:bg-orange-400" : pct >= 50 ? "[&>div]:bg-yellow-400" : "[&>div]:bg-emerald-400"}`} />
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </CardHeader>

                  <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <div ref={messagesContainerRef} className="flex-1 overflow-y-scroll bg-slate-50/80 border-y border-slate-200/60 p-4 messages-scroll">
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
                              <div className="flex items-center gap-3 my-4">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-[11px] font-medium text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full select-none">{group.label}</span>
                                <div className="flex-1 h-px bg-slate-200" />
                              </div>

                              {group.messages.map((message) => (
                                <div key={message.id} className={`flex mb-2 ${message.direction === "inbound" || message.sender === "patient" ? "justify-start" : "justify-end"}`}>
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
                                      {message.sender === "patient" ? <User className="h-3 w-3 opacity-60" /> : message.sender === "ai" ? <Bot className="h-3 w-3 opacity-60" /> : <UserCheck className="h-3 w-3 opacity-60" />}
                                      <span className="text-xs font-medium opacity-70">
                                        {message.sender === "patient" ? "Paciente" : message.sender === "ai" ? "🤖 IA" : "👤 Humano"}
                                      </span>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{stripSenderPrefix(message.text || "")}</p>
                                    <p className="text-[10px] opacity-40 mt-1.5 text-right">{format(new Date(message.createdAt!), "HH:mm", { locale: ptBR })}</p>
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

                  {(selectedConversation?.status === "human" || selectedConversation?.status === "closed") && (
                    <div className="p-3 border-t bg-white shrink-0">
                      {selectedConversation?.status === "closed" && (
                        <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                          <RotateCcw className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-xs text-amber-700">
                            Conversa encerrada. Envie uma mensagem para reativar o atendimento como <strong>Humano</strong>.
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Digite sua mensagem..." onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()} className="flex-1" data-testid="input-message" />
                        <Button onClick={handleSendMessage} disabled={sendMessageMutation.isPending || !messageText.trim()} data-testid="button-send">
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

      {/* ── MODAL DE VÍNCULO ────────────────────────────────────────── */}
      <Dialog open={showLinkModal} onOpenChange={(open) => { setShowLinkModal(open); if (!open) setLinkSearch(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Vincular número a um paciente
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              variant="outline"
              className="w-full border-dashed border-primary/50 text-primary hover:bg-primary/5"
              onClick={() => {
                const phone = selectedConversation?.phone?.replace(/\D/g, "") || "";
                const params = new URLSearchParams();
                if (phone) params.set("phone", phone);
                window.location.href = `/patients?${params.toString()}`;
              }}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Novo — Cadastrar paciente com este número
            </Button>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Buscar paciente por nome ou telefone..."
                className="pl-9"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {linkPatients.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">
                  {linkSearchDebounced ? "Nenhum paciente encontrado" : "Digite para buscar pacientes"}
                </p>
              ) : (
                linkPatients.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">{p.fullName}</p>
                      {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (selectedConversationId)
                          linkPatientMutation.mutate({ conversationId: selectedConversationId, patientId: p.id });
                      }}
                      disabled={linkPatientMutation.isPending}
                    >
                      Associar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmação de encerramento */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar atendimento?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedConversation?.status === "ai"
                ? "Esta conversa está sendo tratada pela IA. Ao encerrar, a IA assumirá a responsabilidade do encerramento e o paciente receberá uma mensagem de conclusão."
                : "O paciente receberá uma mensagem informando que o atendimento foi encerrado. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeConversationMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeConversationMutation.mutate(selectedConversationId)}
              disabled={closeConversationMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {closeConversationMutation.isPending ? "Encerrando..." : "Sim, encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
