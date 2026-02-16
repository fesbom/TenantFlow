import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export interface ExtractedIntent {
  // Ajustado para aceitar 'conversar' ou 'outro' conforme seu routes
  intent: 'agendar' | 'cancelar' | 'remarcar' | 'falar_com_humano' | 'informacao' | 'outro' | 'conversar';
  date?: string;
  time?: string;
  specialty?: string;
  dentistName?: string; // Alterado de doctorName para dentistName (igual ao routes)
  patientName?: string;
  tempData?: string;    // Adicionado para coletar nome de novos pacientes
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

const SYSTEM_PROMPT_BASE = `Você é um assistente virtual de uma clínica odontológica. Seu objetivo é ajudar pacientes a agendar consultas, responder dúvidas e transferir para humanos se necessário.

REGRAS PARA AGENDAMENTO:
1. Você DEVE coletar: Nome do Dentista, Data e Horário.
2. Só defina a intent como 'agendar' se tiver os 3 dados confirmados. Caso contrário, use 'conversar'.
3. Formatos obrigatórios: Data (YYYY-MM-DD), Hora (HH:mm).
4. Nome do Dentista: Extraia o nome e coloque na chave 'dentistName'.

PACIENTES NÃO CADASTRADOS:
- Se o contexto indicar que não é cadastrado, você DEVE pedir o Nome Completo antes de finalizar.
- Coloque o nome completo do interessado no campo 'tempData'.

FORMATO DE RESPOSTA (JSON APENAS):
{
  "message": "sua resposta amigável",
  "intent": "agendar" | "conversar" | "cancelar" | "falar_com_humano" | "informacao",
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "dentistName": "Nome do Dentista",
  "tempData": "Nome completo se novo paciente",
  "confidence": 0.0 a 1.0
}`;

function buildSystemPrompt(patientContext?: PatientContext): string {
  let contextBlock = "";
  if (patientContext?.isRegistered && patientContext.name) {
    contextBlock = `\n\nCONTEXTO: Paciente CADASTRADO: ${patientContext.name}.`;
  } else {
    contextBlock = `\n\nCONTEXTO: Novo interessado NÃO cadastrado. Peça o nome completo.`;
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
      model: "gemini-1.5-flash", // Use o modelo disponível no seu plano
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
        dentistName: parsed.dentistName, // Sincronizado com o Routes
        tempData: parsed.tempData,       // Sincronizado com o Routes
        confidence: parsed.confidence || 0.7,
      }
    };
  } catch (error) {
    console.error("[AI Error]:", error);
    return {
      message: "Tive um problema técnico. Um atendente já vai te ajudar.",
      extractedIntent: { intent: 'falar_com_humano', confidence: 1.0 }
    };
  }
}