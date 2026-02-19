import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Interface sincronizada com o routes.ts
export interface ExtractedIntent {
  intent: 'agendar' | 'cancelar' | 'remarcar' | 'falar_com_humano' | 'informacao' | 'outro' | 'conversar';
  date?: string;
  time?: string;
  specialty?: string;
  dentistName?: string; // IMPORTANTE: Sincronizado com o routes
  patientName?: string;
  tempData?: string;    // Para dados de novos pacientes
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

const SYSTEM_PROMPT_BASE = `Você é um assistente virtual de uma clínica odontológica. Seu objetivo é ajudar pacientes a agendar consultas.

REGRAS OBRIGATÓRIAS PARA AGENDAMENTO:
1. Você deve coletar: Data, Horário e Nome do Dentista.
2. Defina a intent como 'agendar' APENAS quando tiver esses 3 dados confirmados pelo paciente.
3. Se faltar qualquer dado, use intent 'conversar' e peça o dado que falta.
4. Formato de Data: YYYY-MM-DD.
5. Formato de Hora: HH:mm.
6. Nome do Dentista: Extraia e coloque na chave 'dentistName'.

PACIENTES NÃO CADASTRADOS:
- Se o paciente não for cadastrado, peça o Nome Completo e coloque na chave 'tempData'.

FORMATO DE RETORNO (JSON):
{
  "message": "sua resposta",
  "intent": "agendar" | "conversar" | "cancelar" | "falar_com_humano",
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "dentistName": "Nome do Dentista",
  "tempData": "Nome completo se novo",
  "confidence": 0.9
}`;

function buildSystemPrompt(patientContext?: PatientContext): string {
  let contextBlock = "";
  if (patientContext?.isRegistered && patientContext.name) {
    contextBlock = `\n\nCONTEXTO: Paciente CADASTRADO: ${patientContext.name}.`;
  } else {
    contextBlock = `\n\nCONTEXTO: Novo interessado NÃO cadastrado. Solicite o nome completo.`;
  }
  return SYSTEM_PROMPT_BASE + contextBlock;
}

export async function processPatientMessage(
  patientMessage: string,
  conversationHistory: Array<{ role: string; text: string }>,
  patientContext?: PatientContext
): Promise<AIResponse> {
  try {
    const systemPrompt = buildSystemPrompt(patientContext);
    const historyContent = conversationHistory
      .map(msg => `${msg.role === 'patient' ? 'Paciente' : 'Assistente'}: ${msg.text}`)
      .join('\n');

    const fullPrompt = `${systemPrompt}\n\nHistórico:\n${historyContent}\n\nPaciente: ${patientMessage}\n\nResponda APENAS JSON:`;

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
        dentistName: parsed.dentistName || parsed.doctorName, // Fallback se a IA errar a chave
        tempData: parsed.tempData,
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