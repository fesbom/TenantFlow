import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCheck, FlaskConical, Loader2, MessageCircle, Plus, Search, Send, Stethoscope, TriangleAlert, User, X } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Shell } from "@/pages/admin";

interface SimulationStatus {
  clinicId: string;
  clinicName: string;
  simulationMode: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

interface SimContact {
  ref: string;
  type: "patient" | "custom";
  name: string | null;
  phone: string;
  patientId: string | null;
}

interface SimDentist {
  id: string;
  fullName: string;
  instanceId: string;
  instanceName: string;
  instanceLabel: string;
  whatsappPhone: string | null;
  lastMessage: { text: string; direction: string; isSimulated: boolean; createdAt: string } | null;
}

interface SimMessage {
  id: string;
  sender: string;
  direction: "inbound" | "outbound";
  text: string;
  isSimulated: boolean;
  createdAt: string;
}

interface MessagesResponse {
  conversationStatus: string | null;
  messages: SimMessage[];
}

const api = async <T,>(method: string, url: string, body?: unknown): Promise<T> => {
  const response = await apiRequest(method, url, body);
  return response.json() as Promise<T>;
};

const readableError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  const json = raw.slice(raw.indexOf(":") + 1).trim();
  try {
    return (JSON.parse(json) as { message?: string }).message || raw;
  } catch {
    return raw;
  }
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const formatDay = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Hoje";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
};

const formatPhone = (digits: string) => {
  if (digits.length === 13 && digits.startsWith("55")) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

function Avatar({ name, tone = "bg-[#cfd8dc]" }: { name: string; tone?: string }) {
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-[#37474f] ${tone}`}>
      {initials(name) || <User size={18} />}
    </span>
  );
}

function SimulationBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Mensagem gravada durante o Modo Simulação (is_simulated = true)"
      className={`inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-800 ${className}`}
    >
      <FlaskConical size={9} />
      Simulação
    </span>
  );
}

function ModeControl({ clinicId, status }: { clinicId: string; status: SimulationStatus | undefined }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api<SimulationStatus>("PUT", `/api/admin/clinics/${clinicId}/simulator/mode`, { enabled }),
    onSuccess: (next) => queryClient.setQueryData(["simulator-status", clinicId], next),
    onError: (error) => alert(readableError(error)),
  });

  const active = !!status?.simulationMode;

  return (
    <div className={`border-b px-6 py-4 md:px-10 ${active ? "border-amber-300 bg-amber-50" : "bg-[#f8fbfb]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {active ? <TriangleAlert className="mt-0.5 text-amber-600" size={20} /> : <FlaskConical className="mt-0.5 text-[#53808a]" size={20} />}
          <div>
            <p className={`text-sm font-semibold ${active ? "text-amber-900" : "text-[#142d3a]"}`}>
              {active ? "MODO SIMULAÇÃO ATIVO" : "Modo Simulação desativado"}
            </p>
            <p className={`text-xs ${active ? "text-amber-800" : "text-[#58737a]"}`}>
              {active
                ? "Ambiente de teste: nenhuma mensagem desta clínica é enviada pela Evolution API (inclusive para pacientes reais). Tudo é gravado com a marca de simulação."
                : "Ative para testar conversas sem enviar nada pela Evolution API. Enquanto estiver desativado, o simulador não aceita mensagens."}
            </p>
            {status?.updatedAt && (
              <p className="mt-1 font-mono text-[10px] text-[#6b8a90]">
                Última alteração: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(status.updatedAt))}
                {status.updatedByName ? ` · ${status.updatedByName}` : ""}
              </p>
            )}
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          {toggle.isPending && <Loader2 size={14} className="animate-spin" />}
          <span>{active ? "Ativo" : "Inativo"}</span>
          <Switch
            checked={active}
            disabled={!status || toggle.isPending}
            onCheckedChange={(checked) => {
              if (checked && !window.confirm("Ativar o Modo Simulação? Todas as mensagens enviadas por esta clínica deixarão de sair pela Evolution API até a desativação.")) return;
              toggle.mutate(checked);
            }}
            aria-label="Modo Simulação"
          />
        </label>
      </div>
    </div>
  );
}

function NewContactModal({
  clinicId,
  contacts,
  onClose,
  onCreated,
}: {
  clinicId: string;
  contacts: SimContact[];
  onClose: () => void;
  onCreated: (ref: string) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"patient" | "custom">("patient");
  const [search, setSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const patients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return contacts
      .filter((contact) => contact.type === "patient" && contact.patientId)
      .filter((contact) => !term || (contact.name ?? "").toLowerCase().includes(term) || (!!digits && contact.phone.includes(digits)));
  }, [contacts, search]);

  const create = useMutation({
    mutationFn: (payload: { patientId: string } | { name: string; phone: string }) =>
      api<SimContact>("POST", `/api/admin/clinics/${clinicId}/simulator/contacts`, payload),
    onSuccess: async (contact) => {
      await queryClient.invalidateQueries({ queryKey: ["simulator-contacts", clinicId] });
      onCreated(contact.ref);
    },
    onError: (error) => alert(readableError(error)),
  });

  const submit = () => {
    if (mode === "patient") {
      if (patientId) create.mutate({ patientId });
    } else {
      create.mutate({ name: name.trim(), phone });
    }
  };

  const canSubmit = mode === "patient" ? !!patientId : phone.replace(/\D/g, "").length >= 10;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Novo contato">
      <div className="w-full max-w-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Novo contato de simulação</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-[#58737a]"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 border-b text-sm">
          {([["patient", "Paciente existente"], ["custom", "Número avulso"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-4 py-3 ${mode === key ? "border-b-2 border-[#176474] font-semibold text-[#176474]" : "text-[#58737a]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {mode === "patient" ? (
            <>
              <div className="flex items-center gap-2 border px-3 py-2">
                <Search size={15} className="text-[#58737a]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar paciente por nome ou telefone"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              <ul className="mt-3 max-h-64 divide-y overflow-y-auto border">
                {patients.length === 0 && <li className="p-4 text-sm text-[#58737a]">Nenhum paciente com WhatsApp encontrado.</li>}
                {patients.map((patient) => (
                  <li key={patient.ref}>
                    <button
                      onClick={() => setPatientId(patient.patientId!)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${patientId === patient.patientId ? "bg-[#e0f2ed]" : "hover:bg-[#f3f8f8]"}`}
                    >
                      <Avatar name={patient.name ?? patient.phone} />
                      <span>
                        <span className="block text-sm font-medium">{patient.name}</span>
                        <span className="block font-mono text-xs text-[#58737a]">{formatPhone(patient.phone)}</span>
                      </span>
                      {patientId === patient.patientId && <Check size={16} className="ml-auto text-[#176454]" />}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nome de identificação (opcional)</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  placeholder="Ex.: Visitante de teste"
                  className="w-full border px-3 py-2 outline-none focus:border-[#176474]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">WhatsApp (com DDD, e DDI se necessário)</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  placeholder="5511999998888"
                  className="w-full border px-3 py-2 font-mono outline-none focus:border-[#176474]"
                />
              </label>
              <p className="text-xs text-[#58737a]">
                Use o número no formato que o webhook receberia (55 + DDD + número). Para ser reconhecido como paciente, o número deve ser idêntico ao do cadastro.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t px-5 py-4">
          <button onClick={onClose} className="border px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={submit}
            disabled={!canSubmit || create.isPending}
            className="flex items-center gap-2 bg-[#176474] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {create.isPending && <Loader2 size={14} className="animate-spin" />}
            Abrir conversa
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactsScreen({ clinicId, onSelect }: { clinicId: string; onSelect: (ref: string) => void }) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const contactsQuery = useQuery({
    queryKey: ["simulator-contacts", clinicId],
    queryFn: () => api<SimContact[]>("GET", `/api/admin/clinics/${clinicId}/simulator/contacts`),
    staleTime: 0,
  });

  const contacts = contactsQuery.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    const digits = term.replace(/\D/g, "");
    return contacts.filter(
      (contact) => (contact.name ?? "").toLowerCase().includes(term) || (!!digits && contact.phone.includes(digits)),
    );
  }, [contacts, search]);

  const groups: Array<[string, SimContact[]]> = [
    ["Pacientes da clínica", filtered.filter((contact) => contact.type === "patient")],
    ["Números avulsos", filtered.filter((contact) => contact.type === "custom")],
  ];

  return (
    <section className="p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[.2em] text-[#53808a]">ETAPA 1 · APARELHO DO USUÁRIO SIMULADO</p>
          <h2 className="mt-1 text-2xl font-bold">Escolha quem vai conversar</h2>
          <p className="text-sm text-[#58737a]">Você assumirá o papel do contato escolhido, falando com os dentistas da clínica pelo WhatsApp.</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-[#176474] px-4 py-2 text-sm text-white">
          <Plus size={16} />
          Novo Contato
        </button>
      </div>

      <div className="mt-6 flex max-w-md items-center gap-2 border bg-white px-3 py-2">
        <Search size={15} className="text-[#58737a]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {contactsQuery.isLoading && <p className="mt-8 text-sm text-[#58737a]">Carregando contatos…</p>}
      {contactsQuery.isError && (
        <div className="mt-8 text-sm">
          <p className="text-[#a34c38]">{readableError(contactsQuery.error)}</p>
          <button onClick={() => contactsQuery.refetch()} className="mt-2 border px-3 py-1">Tentar novamente</button>
        </div>
      )}

      {!contactsQuery.isLoading && !contactsQuery.isError && groups.map(([title, items]) => (
        <div key={title} className="mt-8">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#52717a]">{title} · {items.length}</h3>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-[#58737a]">Nenhum contato.</p>
          ) : (
            <ul className="mt-3 grid gap-px border bg-[#ccdcdf] sm:grid-cols-2 xl:grid-cols-3">
              {items.map((contact) => (
                <li key={contact.ref} className="bg-white">
                  <button onClick={() => onSelect(contact.ref)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f3f8f8]">
                    <Avatar name={contact.name ?? contact.phone} tone={contact.type === "patient" ? "bg-[#cfe9e4]" : "bg-[#ffe9b8]"} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{contact.name || "Sem nome"}</span>
                      <span className="block font-mono text-xs text-[#58737a]">{formatPhone(contact.phone)}</span>
                    </span>
                    <MessageCircle size={16} className="ml-auto shrink-0 text-[#176474]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {modalOpen && (
        <NewContactModal
          clinicId={clinicId}
          contacts={contacts}
          onClose={() => setModalOpen(false)}
          onCreated={(ref) => {
            setModalOpen(false);
            onSelect(ref);
          }}
        />
      )}
    </section>
  );
}

function ChatScreen({
  clinicId,
  contactRef,
  simulationActive,
  onBack,
}: {
  clinicId: string;
  contactRef: string;
  simulationActive: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [dentistId, setDentistId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<SimMessage[]>([]);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const dentistsKey = ["simulator-dentists", clinicId, contactRef];
  const dentistsQuery = useQuery({
    queryKey: dentistsKey,
    queryFn: () => api<{ contact: SimContact; dentists: SimDentist[] }>("GET", `/api/admin/clinics/${clinicId}/simulator/contacts/${encodeURIComponent(contactRef)}/dentists`),
    refetchInterval: 4000,
    staleTime: 0,
  });

  const dentists = dentistsQuery.data?.dentists ?? [];
  const contact = dentistsQuery.data?.contact;
  const selectedDentist = dentists.find((dentist) => dentist.id === dentistId) ?? null;

  useEffect(() => {
    if (!dentistId && dentists.length > 0) setDentistId(dentists[0].id);
  }, [dentistId, dentists]);

  const messagesKey = ["simulator-messages", clinicId, contactRef, dentistId];
  const messagesQuery = useQuery({
    queryKey: messagesKey,
    queryFn: () => api<MessagesResponse>("GET", `/api/admin/clinics/${clinicId}/simulator/contacts/${encodeURIComponent(contactRef)}/dentists/${dentistId}/messages`),
    enabled: !!dentistId,
    refetchInterval: 1500,
    staleTime: 0,
  });

  const send = useMutation({
    mutationFn: ({ text, targetDentistId }: { text: string; targetDentistId: string }) =>
      api<MessagesResponse>("POST", `/api/admin/clinics/${clinicId}/simulator/contacts/${encodeURIComponent(contactRef)}/dentists/${targetDentistId}/messages`, { text }),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["simulator-messages", clinicId, contactRef, variables.targetDentistId], (previous: MessagesResponse | undefined) => ({ ...previous, ...data }));
      queryClient.invalidateQueries({ queryKey: dentistsKey });
    },
    onError: (error) => setSendError(readableError(error)),
    onSettled: () => setPending([]),
  });

  const messages = useMemo(() => {
    const server = messagesQuery.data?.messages ?? [];
    return [...server, ...pending];
  }, [messagesQuery.data, pending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, send.isPending]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !dentistId || send.isPending || !simulationActive) return;
    setSendError("");
    setDraft("");
    setPending([{ id: `pending-${Date.now()}`, sender: "patient", direction: "inbound", text, isSimulated: true, createdAt: new Date().toISOString() }]);
    send.mutate({ text, targetDentistId: dentistId });
  };

  const contactName = contact?.name || (contact ? formatPhone(contact.phone) : "…");

  return (
    <section className="p-4 md:p-8">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 font-mono text-xs text-[#37707a]">
          <ArrowLeft size={15} />
          Voltar aos contatos
        </button>
        <p className="text-xs text-[#58737a]">
          Você está como <b className="text-[#142d3a]">{contactName}</b>
          {contact && contact.name ? <span className="font-mono"> · {formatPhone(contact.phone)}</span> : null}
        </p>
      </div>

      <div className="flex h-[calc(100dvh-17rem)] min-h-[420px] overflow-hidden border bg-white shadow-sm">
        <aside className="flex w-full max-w-[22rem] shrink-0 flex-col border-r bg-white max-md:max-w-[40%]">
          <div className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-3">
            <Avatar name={contactName} tone="bg-[#dfe5e7]" />
            <p className="truncate text-sm font-semibold">{contactName}</p>
          </div>
          <p className="border-b px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-[#667781]">Dentistas da clínica</p>
          <ul className="flex-1 overflow-y-auto">
            {dentistsQuery.isLoading && <li className="p-4 text-sm text-[#667781]">Carregando…</li>}
            {dentistsQuery.isError && <li className="p-4 text-sm text-[#a34c38]">{readableError(dentistsQuery.error)}</li>}
            {!dentistsQuery.isLoading && !dentistsQuery.isError && dentists.length === 0 && (
              <li className="p-4 text-sm text-[#667781]">
                Nenhum dentista com número de WhatsApp vinculado. Vincule dentistas a um número em Configurações › WhatsApp da clínica.
              </li>
            )}
            {dentists.map((dentist) => (
              <li key={dentist.id}>
                <button
                  onClick={() => {
                    setDentistId(dentist.id);
                    setPending([]);
                    setSendError("");
                  }}
                  className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left ${dentist.id === dentistId ? "bg-[#f0f2f5]" : "hover:bg-[#f7f8f9]"}`}
                >
                  <Avatar name={dentist.fullName} tone="bg-[#d9fdd3]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{dentist.fullName}</span>
                      {dentist.lastMessage && <span className="shrink-0 text-[11px] text-[#667781]">{formatTime(dentist.lastMessage.createdAt)}</span>}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#667781]">
                      {dentist.lastMessage?.direction === "inbound" && <CheckCheck size={13} className="shrink-0 text-[#53bdeb]" />}
                      <span className="truncate">{dentist.lastMessage ? dentist.lastMessage.text : dentist.instanceLabel}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-[#efeae2]">
          {!selectedDentist ? (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-[#667781]">
              <div>
                <Stethoscope className="mx-auto mb-3" size={36} />
                Selecione um dentista para iniciar a conversa.
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-3">
                <Avatar name={selectedDentist.fullName} tone="bg-[#d9fdd3]" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedDentist.fullName}</p>
                  <p className="truncate text-xs text-[#667781]">
                    {selectedDentist.instanceLabel}
                    {selectedDentist.whatsappPhone ? ` · ${formatPhone(selectedDentist.whatsappPhone)}` : ""}
                    {messagesQuery.data?.conversationStatus === "human" ? " · atendimento humano" : ""}
                  </p>
                </div>
                <SimulationBadge className="ml-auto" />
              </header>

              <div className="flex-1 space-y-1 overflow-y-auto px-[6%] py-4">
                {messagesQuery.isLoading && <p className="text-center text-sm text-[#667781]">Carregando mensagens…</p>}
                {messagesQuery.isError && <p className="text-center text-sm text-[#a34c38]">{readableError(messagesQuery.error)}</p>}
                {!messagesQuery.isLoading && messages.length === 0 && (
                  <p className="mx-auto mt-6 max-w-xs rounded bg-[#fff5c4] px-3 py-2 text-center text-xs text-[#54656f]">
                    Nenhuma mensagem ainda. Envie a primeira em nome de {contactName}.
                  </p>
                )}
                {messages.map((message, index) => {
                  const mine = message.direction === "inbound";
                  const previous = messages[index - 1];
                  const showDay = !previous || formatDay(previous.createdAt) !== formatDay(message.createdAt);
                  return (
                    <div key={message.id}>
                      {showDay && (
                        <div className="my-3 text-center">
                          <span className="rounded bg-white px-3 py-1 text-[11px] text-[#667781] shadow-sm">{formatDay(message.createdAt)}</span>
                        </div>
                      )}
                      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${mine ? "bg-[#d9fdd3]" : "bg-white"}`}>
                          {!mine && message.sender === "ai" && <p className="text-[10px] font-semibold text-[#176454]">🤖 Assistente IA</p>}
                          {!mine && message.sender === "staff" && <p className="text-[10px] font-semibold text-[#176474]">👤 Atendente</p>}
                          <p className="whitespace-pre-wrap break-words">{message.text}</p>
                          <div className="mt-1 flex items-center justify-end gap-2">
                            {message.isSimulated && <SimulationBadge />}
                            <span className="text-[10px] text-[#667781]">{formatTime(message.createdAt)}</span>
                            {mine && (message.id.startsWith("pending-")
                              ? <Check size={14} className="text-[#8696a0]" />
                              : <CheckCheck size={14} className="text-[#53bdeb]" />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {send.isPending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-[#667781] shadow-sm">
                      <Loader2 size={12} className="animate-spin" />
                      {selectedDentist.fullName.split(" ")[0]} está digitando…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {sendError && <p className="bg-red-50 px-4 py-2 text-xs text-red-700">{sendError}</p>}
              {!simulationActive && (
                <p className="bg-amber-50 px-4 py-2 text-xs text-amber-800">Ative o Modo Simulação para enviar mensagens.</p>
              )}
              <form
                className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!simulationActive}
                  maxLength={4000}
                  placeholder={simulationActive ? "Digite uma mensagem" : "Modo Simulação desativado"}
                  className="flex-1 rounded-lg bg-white px-4 py-2 text-sm outline-none disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || send.isPending || !simulationActive}
                  aria-label="Enviar"
                  className="grid h-10 w-10 place-items-center rounded-full bg-[#00a884] text-white disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function AdminSimulator() {
  const { id } = useParams<{ id: string }>();
  const [contactRef, setContactRef] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["simulator-status", id],
    queryFn: () => api<SimulationStatus>("GET", `/api/admin/clinics/${id}/simulator/status`),
    refetchInterval: 10000,
    staleTime: 0,
  });

  return (
    <Shell>
      <header className="border-b bg-[#f8fbfb] px-6 py-6 md:px-10">
        <Link href={`/admin/clinics/${id}`} className="flex items-center gap-2 font-mono text-xs text-[#37707a]">
          <ArrowLeft size={15} />
          Voltar ao dossiê da clínica
        </Link>
        <p className="mt-5 font-mono text-[10px] tracking-[.2em] text-[#53808a]">FERRAMENTAS / SIMULADOR DE WHATSAPP</p>
        <h1 className="mt-1 text-3xl font-bold">{statusQuery.data?.clinicName ?? "Simulador de WhatsApp"}</h1>
      </header>

      <ModeControl clinicId={id} status={statusQuery.data} />

      {statusQuery.isError ? (
        <div className="p-10 text-sm">
          <p className="text-[#a34c38]">{readableError(statusQuery.error)}</p>
          <button onClick={() => statusQuery.refetch()} className="mt-3 border px-3 py-2">Tentar novamente</button>
        </div>
      ) : contactRef ? (
        <ChatScreen
          key={contactRef}
          clinicId={id}
          contactRef={contactRef}
          simulationActive={!!statusQuery.data?.simulationMode}
          onBack={() => setContactRef(null)}
        />
      ) : (
        <ContactsScreen clinicId={id} onSelect={setContactRef} />
      )}
    </Shell>
  );
}
