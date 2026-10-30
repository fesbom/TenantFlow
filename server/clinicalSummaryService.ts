import { GoogleGenAI } from "@google/genai";
import { pool } from "./db";

const ai = new GoogleGenAI({
  apiKey:
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "",
  httpOptions: {
    apiVersion:
      process.env.AI_INTEGRATIONS_GEMINI_API_VERSION ??
      (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ? "" : "v1beta"),
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || undefined,
  },
});

export interface ClinicalSummaryMovement {
  data: string;
  descricao: string;
  regiao?: string | null;
  dente?: string | null;
}

export interface ClinicalSummaryTreatment {
  titulo: string;
  situacao: string;
  dataInicio: string;
  dentistName?: string | null;
  movements: ClinicalSummaryMovement[];
  budgetItems: Array<{ descricao: string; valor: string }>;
}

export interface ClinicalSummaryInput {
  patientId: string;
  patientName: string;
  appointmentProcedure?: string | null;
  appointmentDate?: string | null;
  treatments: ClinicalSummaryTreatment[];
  whatsappMessages: Array<{ sender: string; text: string; createdAt: string }>;
}

export interface ClinicalSummary {
  realizado: string;
  expectativa: string;
}

// Cache em memória para evitar chamadas repetidas à IA ao reimprimir/navegar na agenda.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const summaryCache = new Map<string, { summary: ClinicalSummary; expiresAt: number }>();

export function invalidateClinicalSummaryCache(patientId: string): void {
  summaryCache.delete(patientId);
}

const SENDER_LABELS: Record<string, string> = {
  patient: "Paciente",
  ai: "Clínica (IA)",
  staff: "Clínica",
};

function formatMessageDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function buildPrompt(input: ClinicalSummaryInput): string {
  const treatmentBlocks = input.treatments
    .map((t) => {
      const lines = [
        `- Tratamento: ${t.titulo} | Situação: ${t.situacao} | Início: ${t.dataInicio}${t.dentistName ? ` | Dentista: ${t.dentistName}` : ""}`,
      ];
      if (t.movements.length > 0) {
        lines.push("  Movimentações/evoluções:");
        t.movements.forEach((m) => {
          const extra = [m.regiao ? `região ${m.regiao}` : null, m.dente ? `dente ${m.dente}` : null]
            .filter(Boolean)
            .join(", ");
          lines.push(`  • ${m.data}: ${m.descricao}${extra ? ` (${extra})` : ""}`);
        });
      }
      if (t.budgetItems.length > 0) {
        lines.push("  Itens orçados/planejados:");
        t.budgetItems.forEach((b) => lines.push(`  • ${b.descricao} (R$ ${b.valor})`));
      }
      return lines.join("\n");
    })
    .join("\n");

  const whatsappBlock = input.whatsappMessages
    .map((m) => {
      const date = formatMessageDate(m.createdAt);
      const sender = SENDER_LABELS[m.sender] ?? m.sender;
      return `[${date}] ${sender}: ${m.text}`;
    })
    .join("\n");

  return `Você é um assistente clínico odontológico que prepara o dentista para o atendimento do dia.
Com base no histórico do paciente abaixo (tratamentos, movimentações/evoluções clínicas, itens orçados e conversa de WhatsApp), gere um RESUMO TÉCNICO ODONTOLÓGICO objetivo para o dentista relembrar o caso antes de atender.

RETORNE APENAS JSON no formato:
{"realizado": "...", "expectativa": "..."}

REGRAS:
- "realizado": síntese do que JÁ foi executado (procedimentos, dentes/regiões tratadas, datas e situação dos tratamentos). Use terminologia odontológica técnica.
- "expectativa": o que provavelmente deve ser feito na consulta atual e os próximos passos (tratamentos em andamento, itens orçados ainda não executados, queixas ou solicitações recentes do paciente no WhatsApp).
- Não invente procedimentos, dentes ou datas. Se faltar informação para uma seção, escreva "Sem registros suficientes."
- Máximo 100 palavras por seção. Português do Brasil.

PACIENTE: ${input.patientName}
${input.appointmentDate ? `DATA DA CONSULTA DE HOJE: ${input.appointmentDate}` : ""}
${input.appointmentProcedure ? `PROCEDIMENTO AGENDADO HOJE: ${input.appointmentProcedure}` : ""}

=== TRATAMENTOS E MOVIMENTAÇÕES ===
${treatmentBlocks || "Nenhum tratamento registrado."}

=== CONVERSA WHATSAPP (mais recentes) ===
${whatsappBlock || "Nenhuma conversa registrada."}

Responda APENAS com o JSON:`;
}

export async function generateClinicalSummary(
  input: ClinicalSummaryInput,
  clinicId?: string,
): Promise<ClinicalSummary> {
  const cached = summaryCache.get(input.patientId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.summary;
  }

  const response = await ai.models.generateContent({
    model: process.env.AI_INTEGRATIONS_GEMINI_MODEL || "gemini-3.8-flash",
    contents: buildPrompt(input),
    config: { responseMimeType: "application/json" },
  });

  if (clinicId && response.usageMetadata) {
    const promptTokens = Number(response.usageMetadata.promptTokenCount || 0);
    const completionTokens = Number(response.usageMetadata.candidatesTokenCount || 0);
    const totalTokens = Number(response.usageMetadata.totalTokenCount || promptTokens + completionTokens);
    try {
      await pool.query(
        `INSERT INTO ai_usage_records
          (clinic_id, source, prompt_tokens, completion_tokens, total_tokens)
         VALUES ($1, 'clinical_summary_gemini', $2, $3, $4)`,
        [clinicId, promptTokens, completionTokens, totalTokens],
      );
    } catch (usageError) {
      console.error("[AI Usage Error]:", usageError);
    }
  }

  const rawText = (response.text || "{}")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");

  let summary: ClinicalSummary;
  try {
    const parsed = JSON.parse(rawText);
    summary = {
      realizado: String(parsed.realizado || "Sem registros suficientes."),
      expectativa: String(parsed.expectativa || "Sem registros suficientes."),
    };
  } catch {
    summary = { realizado: rawText.trim() || "Sem registros suficientes.", expectativa: "" };
  }

  summaryCache.set(input.patientId, { summary, expiresAt: Date.now() + CACHE_TTL_MS });
  return summary;
}
