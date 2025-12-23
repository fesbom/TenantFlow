import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export interface ExtractedIntent {
  intent: 'agendar' | 'cancelar' | 'remarcar' | 'falar_com_humano' | 'informacao' | 'outro';
  date?: string;
  time?: string;
  specialty?: string;
  doctorName?: string;
  patientName?: string;
  phone?: string;
  reason?: string;
  confidence: number;
}

export interface AIResponse {
  message: string;
  extractedIntent: ExtractedIntent;
}

const SYSTEM_PROMPT = `Você é um assistente virtual de uma clínica odontológica. Seu objetivo é ajudar pacientes a agendar consultas, responder dúvidas e, quando necessário, transferir para um atendente humano.

REGRAS:
1. Seja sempre educado, profissional e objetivo
2. Quando o paciente quiser agendar, pergunte: nome completo, data/horário preferido, tipo de procedimento
3. Se o paciente pedir para falar com uma pessoa ou demonstrar frustração, transfira imediatamente
4. Forneça informações básicas sobre procedimentos comuns (limpeza, clareamento, etc.)
5. Nunca invente informações sobre preços ou disponibilidade de horários

FORMATO DE RESPOSTA:
Você DEVE retornar um JSON válido com a seguinte estrutura:
{
  "message": "sua resposta para o paciente",
  "intent": "agendar" | "cancelar" | "remarcar" | "falar_com_humano" | "informacao" | "outro",
  "date": "YYYY-MM-DD se mencionado",
  "time": "HH:MM se mencionado",
  "specialty": "tipo de procedimento se mencionado",
  "doctorName": "nome do dentista se mencionado",
  "patientName": "nome do paciente se mencionado",
  "reason": "motivo da consulta ou cancelamento",
  "confidence": 0.0 a 1.0
}

Exemplos de intenções:
- "Quero marcar uma consulta" → intent: "agendar"
- "Preciso cancelar minha consulta" → intent: "cancelar"
- "Quero mudar o horário" → intent: "remarcar"
- "Quero falar com alguém" / "Isso é ridículo" → intent: "falar_com_humano"
- "Qual o horário de funcionamento?" → intent: "informacao"`;

export async function processPatientMessage(
  patientMessage: string,
  conversationHistory: Array<{ role: string; text: string }>
): Promise<AIResponse> {
  try {
    const messages = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Entendido. Estou pronto para ajudar os pacientes." }] },
    ];

    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role === 'patient' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      });
    }

    messages.push({
      role: "user",
      parts: [{ text: patientMessage }],
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: messages,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || '{}';
    
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return {
        message: "Desculpe, tive um problema ao processar sua mensagem. Vou transferir você para um atendente.",
        extractedIntent: {
          intent: 'falar_com_humano',
          confidence: 0.5,
          reason: 'Erro ao processar resposta da IA'
        }
      };
    }

    return {
      message: parsed.message || "Como posso ajudar você hoje?",
      extractedIntent: {
        intent: parsed.intent || 'outro',
        date: parsed.date,
        time: parsed.time,
        specialty: parsed.specialty,
        doctorName: parsed.doctorName,
        patientName: parsed.patientName,
        phone: parsed.phone,
        reason: parsed.reason,
        confidence: parsed.confidence || 0.7,
      }
    };
  } catch (error) {
    console.error("Error processing message with Gemini:", error);
    return {
      message: "Desculpe, estamos com dificuldades técnicas. Um atendente entrará em contato em breve.",
      extractedIntent: {
        intent: 'falar_com_humano',
        confidence: 1.0,
        reason: 'Erro técnico'
      }
    };
  }
}
