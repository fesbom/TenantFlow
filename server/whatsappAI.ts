import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
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

const SYSTEM_PROMPT_BASE = `Você é um Assistente Virtual de uma clínica odontológica chamada [CLINIC_NAME]. Sempre se identifique como "Assistente Virtual da [CLINIC_NAME]" na primeira mensagem ou quando perguntado quem você é. Seu objetivo é ajudar pacientes a agendar consultas.

REGRAS OBRIGATÓRIAS PARA AGENDAMENTO:
1. Você deve coletar: Data, Horário e Nome do Dentista.
2. Defina a intent como 'agendar' APENAS quando tiver esses 3 dados confirmados pelo paciente.
3. Se faltar qualquer dado, use intent 'conversar' e peça o dado que falta.
4. Formato de Data: YYYY-MM-DD.
5. Formato de Hora: HH:mm.
6. Nome do Dentista: Extraia e coloque na chave 'dentistName'.
7. Sempre que identificar uma intenção de agendamento, crie um resumo curto na chave summary.
Exemplo: 'Limpeza com Dr. Ericson solicitado via WhatsApp'.
8. Se o paciente não for cadastrado, inclua o nome que ele informou e o telefone no resumo e no tempdata.

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
  "tempData": "Nome completo se novo",
  "summary": "Resumo curto do agendamento",
  "confidence": 0.9
}`;

const IDENTIFIED_PATIENT_BLOCK = (name: string) => `

=== PACIENTE IDENTIFICADO — INSTRUÇÕES OBRIGATÓRIAS ===
O paciente desta conversa é: ${name}
REGRAS ABSOLUTAS que você NUNCA pode violar:
1. NUNCA peça o nome completo — você já possui essa informação.
2. NUNCA diga "pode me informar seu nome?" ou qualquer variação.
3. Chame o paciente pelo primeiro nome (${name.split(' ')[0]}) de forma natural.
4. Para agendamento, colete APENAS: Data, Horário e Nome do Dentista.
5. No campo "summary", inclua obrigatoriamente: "${name} | WhatsApp".
6. NÃO preencha "tempData" — o paciente já está cadastrado.
=== FIM DAS INSTRUÇÕES ===`;

const UNIDENTIFIED_PATIENT_BLOCK = `

=== PACIENTE NÃO IDENTIFICADO ===
Este número não está vinculado a nenhum cadastro.
REGRAS:
1. Solicite o nome completo educadamente antes de prosseguir.
2. Após obter o nome, continue normalmente coletando data, horário e dentista.
3. Inclua o nome informado em "tempData" e no "summary".
=== FIM DAS INSTRUÇÕES ===`;

function buildSystemPrompt(patientContext?: PatientContext, clinicName?: string): string {
  const resolvedClinicName = clinicName || "nossa clínica";
  let prompt = SYSTEM_PROMPT_BASE.replace(/\[CLINIC_NAME\]/g, resolvedClinicName);

  if (patientContext?.isRegistered && patientContext.name) {
    prompt += IDENTIFIED_PATIENT_BLOCK(patientContext.name);
  } else {
    prompt += UNIDENTIFIED_PATIENT_BLOCK;
  }
  return prompt;
}

export async function processPatientMessage(
  patientMessage: string,
  conversationHistory: Array<{ role: string; text: string }>,
  patientContext?: PatientContext,
  clinicName?: string
): Promise<AIResponse> {
  try {
    const systemPrompt = buildSystemPrompt(patientContext, clinicName);

    const now = new Date();
    const currentDateInfo = `DATA ATUAL DO SISTEMA: ${now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Hora: ${now.getHours()}:${now.getMinutes()}`;

    const historyContent = conversationHistory
      .map(msg => `${msg.role === 'patient' ? 'Paciente' : 'Assistente'}: ${msg.text}`)
      .join('\n');

    const fullPrompt = `${systemPrompt}\n\n${currentDateInfo}\n\nHistórico:\n${historyContent}\n\nPaciente: ${patientMessage}\n\nResponda APENAS JSON:`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: { responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(response.text || '{}');

    return {
      message: parsed.message || "Como posso ajudar?",
      extractedIntent: {
        intent: parsed.intent || 'conversar',
        date: parsed.date,
        time: parsed.time,
        specialty: parsed.specialty,
        dentistName: parsed.dentistName || parsed.doctorName,
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
