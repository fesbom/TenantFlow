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

export interface ExtractedIntent {
  intent: 'agendar' | 'cancelar' | 'remarcar' | 'falar_com_humano' | 'informacao' | 'outro' | 'conversar' | 'listar_dentistas';
  date?: string;
  time?: string;
  specialty?: string;
  dentistName?: string;
  doctorName?: string;
  patientName?: string;
  targetPatientName?: string;
  targetPatientCpf?: string;
  targetPatientPhone?: string;
  bookingForAnotherPerson?: boolean;
  relationshipToPatient?: string;
  tempData?: string;
  summary?: string;
  phone?: string;
  reason?: string;
  confidence: number;
}

export interface AIResponse {
  message: string;
  extractedIntent: ExtractedIntent;
}

export interface PatientContext {
  isRegistered: boolean;
  name: string | null;
}

// ─── Instance context: shapes which dentists the AI can suggest ──────────────
export type InstanceContext =
  | { type: "exclusive"; dentistName: string; dentistId: string }
  | { type: "shared"; dentists: { name: string; id: string }[] }
  | { type: "general" };

// ─── System prompt base ───────────────────────────────────────────────────────
const SYSTEM_PROMPT_BASE = `Você é um Assistente Virtual de uma clínica odontológica chamada [CLINIC_NAME]. Sempre se identifique como "Assistente Virtual da [CLINIC_NAME]" na primeira mensagem ou quando perguntado quem você é. Seu objetivo é ajudar pacientes a agendar consultas.

REGRAS OBRIGATÓRIAS PARA AGENDAMENTO:
1. Você deve coletar: Data, Horário e Nome do Dentista.
2. Antes de confirmar um agendamento para uma pessoa ainda não identificada, colete nome completo e CPF da pessoa que será atendida. Não invente, não altere e não presuma CPF.
3. Pergunte explicitamente se o contato agenda para si ou para outra pessoa quando isso não estiver claro. Se for para outra pessoa, preencha bookingForAnotherPerson=true, relationshipToPatient (ex.: pai, mãe, responsável), targetPatientName e targetPatientCpf.
4. Para contato não cadastrado que agenda para si, também preencha targetPatientName e targetPatientCpf. O CPF será conferido pelo sistema antes de qualquer cadastro.
5. Defina a intent como 'agendar' APENAS quando tiver data, horário, dentista e todos os dados de identificação exigidos nesta conversa. Se faltar qualquer dado, use intent 'conversar' e peça somente o próximo dado faltante.
6. Formato de Data: YYYY-MM-DD. Formato de Hora: HH:mm. CPF deve ser retornado somente com dígitos.
7. Nome do Dentista: Extraia e coloque na chave 'dentistName'.
8. Sempre que identificar uma intenção de agendamento, crie um resumo curto na chave summary. Exemplo: 'Limpeza com Dr. Ericson solicitado via WhatsApp'.
9. Não informe que criou um cadastro nem afirme que o CPF existe ou não existe: essa validação é responsabilidade do sistema.
10. targetPatientPhone é opcional; preencha apenas se o contato fornecer um telefone específico da pessoa atendida.

INTENÇÃO LISTAR_DENTISTAS:
- Se o paciente perguntar "Quais dentistas?", "Quem são os dentistas?", "Quais profissionais?", "Quem atende?", ou similares, defina intent como 'listar_dentistas'.
- Responda com mensagem amigável dizendo que vai verificar a lista de profissionais disponíveis.

FORMATO DE RETORNO (JSON):
{
  "message": "sua resposta",
  "intent": "agendar" | "conversar" | "cancelar" | "falar_com_humano" | "listar_dentistas",
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "dentistName": "Nome do Dentista",
  "bookingForAnotherPerson": false,
  "relationshipToPatient": "pai, mãe ou responsável quando aplicável",
  "targetPatientName": "Nome completo da pessoa atendida quando necessário",
  "targetPatientCpf": "Somente dígitos do CPF quando necessário",
  "targetPatientPhone": "Telefone da pessoa atendida, se informado",
  "tempData": "Nome completo se novo (compatibilidade)",
  "summary": "Resumo curto do agendamento",
  "confidence": 0.9
}`;

const IDENTIFIED_PATIENT_BLOCK = (name: string) => `

=== PACIENTE IDENTIFICADO — INSTRUÇÕES OBRIGATÓRIAS ===
O paciente desta conversa é: ${name}
REGRAS ABSOLUTAS:
1. Para agendamento do próprio paciente, NUNCA peça nome completo ou CPF: ele já está identificado.
2. Chame o paciente pelo primeiro nome (${name.split(' ')[0]}) de forma natural.
3. Se o contato informar que agenda para filho(a), dependente ou qualquer outra pessoa, isso é um agendamento para terceiro: peça o nome completo e CPF da pessoa atendida, marque bookingForAnotherPerson=true e não use os dados do contato como dados do paciente-alvo.
4. Para agendamento próprio, colete somente data, horário e dentista.
5. No campo "summary", inclua obrigatoriamente: "${name} | WhatsApp".
6. NÃO preencha "tempData" para agendamento próprio.
=== FIM DAS INSTRUÇÕES ===`;

const UNIDENTIFIED_PATIENT_BLOCK = `

=== PACIENTE NÃO IDENTIFICADO ===
Este número não está vinculado a nenhum cadastro.
REGRAS:
1. Confirme se o contato agenda para si ou para outra pessoa.
2. Para a pessoa que será atendida, solicite nome completo e CPF antes de concluir o agendamento. Se houver terceiro, não peça nem assuma o CPF do contato.
3. NÃO pergunte data, horário ou dentista antes de receber nome completo e CPF. A identificação é sempre a primeira etapa para contatos não cadastrados.
4. Após obter os dados de identificação, continue coletando data, horário e dentista.
5. Preencha targetPatientName e targetPatientCpf; inclua o nome no resumo.
=== FIM DAS INSTRUÇÕES ===`;

// ─── Instance-context blocks injected into the prompt ────────────────────────
function buildInstanceBlock(ctx: InstanceContext): string {
  if (ctx.type === "exclusive") {
    return `

=== NÚMERO EXCLUSIVO DE DENTISTA ===
O paciente entrou em contato pelo número exclusivo de ${ctx.dentistName}.
REGRAS:
1. Ao surgir qualquer intenção de agendamento, PROATIVAMENTE sugira ${ctx.dentistName}: "Identifiquei que você está entrando em contato pelo número do(a) ${ctx.dentistName}. Podemos registrar o agendamento no nome dele(a)?"
2. Se o paciente confirmar, use "${ctx.dentistName}" como valor de dentistName.
3. Se o paciente preferir outro dentista, respeite a escolha normalmente.
=== FIM DAS INSTRUÇÕES ===`;
  }

  if (ctx.type === "shared") {
    const names = ctx.dentists.map((d) => d.name).join(" e ");
    const bullets = ctx.dentists.map((d) => `• ${d.name}`).join("\n");
    return `

=== NÚMERO COMPARTILHADO ===
Este número é compartilhado por ${names}.
REGRAS:
1. Na primeira mensagem de agendamento, RESTRINJA as opções iniciais a estes profissionais:
${bullets}
   Pergunte: "Este número é compartilhado por ${names}. Você gostaria de agendar com algum deles ou com outro profissional da clínica?"
2. Se o paciente escolher um deles, use o nome exato como dentistName.
3. Se o paciente quiser outro profissional, trate normalmente (intent listar_dentistas se necessário).
=== FIM DAS INSTRUÇÕES ===`;
  }

  // general — no special block
  return "";
}

function buildSystemPrompt(
  patientContext?: PatientContext,
  clinicName?: string,
  instanceContext?: InstanceContext,
): string {
  const resolvedClinicName = clinicName || "nossa clínica";
  let prompt = SYSTEM_PROMPT_BASE.replace(/\[CLINIC_NAME\]/g, resolvedClinicName);

  if (patientContext?.isRegistered && patientContext.name) {
    prompt += IDENTIFIED_PATIENT_BLOCK(patientContext.name);
  } else {
    prompt += UNIDENTIFIED_PATIENT_BLOCK;
  }

  if (instanceContext) {
    prompt += buildInstanceBlock(instanceContext);
  }

  return prompt;
}

export async function processPatientMessage(
  patientMessage: string,
  conversationHistory: Array<{ role: string; text: string }>,
  patientContext?: PatientContext,
  clinicName?: string,
  instanceContext?: InstanceContext,
  clinicId?: string,
): Promise<AIResponse> {
  try {
    const systemPrompt = buildSystemPrompt(patientContext, clinicName, instanceContext);

    const tz = "America/Sao_Paulo";
    const now = new Date();
    const dateText = now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
    const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    const timeText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const currentDateInfo = `DATA ATUAL DO SISTEMA (fuso America/Sao_Paulo): ${dateText} (${isoDate}). Hora: ${timeText}. Calcule "hoje", "amanhã" e dias da semana a partir desta data.`;

    const historyContent = conversationHistory
      .map(msg => `${msg.role === 'patient' ? 'Paciente' : 'Assistente'}: ${msg.text}`)
      .join('\n');

    const fullPrompt = `${systemPrompt}\n\n${currentDateInfo}\n\nHistórico:\n${historyContent}\n\nPaciente: ${patientMessage}\n\nResponda APENAS JSON:`;

    const response = await ai.models.generateContent({
      model: process.env.AI_INTEGRATIONS_GEMINI_MODEL || "gemini-3.8-flash",
      contents: fullPrompt,
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
           VALUES ($1, 'whatsapp_gemini', $2, $3, $4)`,
          [clinicId, promptTokens, completionTokens, totalTokens],
        );
      } catch (usageError) {
        console.error("[AI Usage Error]:", usageError);
      }
    }

    const rawText = (response.text || '{}').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(rawText);

    return {
      message: parsed.message || "Como posso ajudar?",
      extractedIntent: {
        intent: parsed.intent || 'conversar',
        date: parsed.date,
        time: parsed.time,
        specialty: parsed.specialty,
        dentistName: parsed.dentistName || parsed.doctorName,
        patientName: parsed.patientName,
        targetPatientName: parsed.targetPatientName,
        targetPatientCpf: parsed.targetPatientCpf,
        targetPatientPhone: parsed.targetPatientPhone,
        bookingForAnotherPerson: parsed.bookingForAnotherPerson === true,
        relationshipToPatient: parsed.relationshipToPatient,
        tempData: parsed.tempData,
        summary: parsed.summary,
        confidence: parsed.confidence || 0.7,
      }
    };
  } catch (error) {
    console.error("[AI Error]:", error);
    return {
      message: "Desculpe, tive um erro técnico. Um atendente vai te ajudar.",
      extractedIntent: { intent: 'falar_com_humano', confidence: 1.0 }
    };
  }
}
