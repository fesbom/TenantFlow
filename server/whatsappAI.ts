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

function buildSystemPrompt(patientContext?: PatientContext, clinicName?: string): string {
  const resolvedClinicName = clinicName || "nossa clínica";
  let prompt = SYSTEM_PROMPT_BASE.replace(/\[CLINIC_NAME\]/g, resolvedClinicName);

  if (patientContext?.isRegistered && patientContext.name) {
    prompt += `\n\nCONTEXTO: Paciente CADASTRADO: ${patientContext.name}.`;
  } else {
    prompt += `\n\nCONTEXTO: Novo interessado NÃO cadastrado. Solicite o nome completo.`;
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
