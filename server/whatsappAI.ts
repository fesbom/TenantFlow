import { GoogleGenerativeAI } from "@google/generative-ai";

// Configuração utilizando a sua chave real configurada nos Secrets
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

// Seleção do modelo (Sugestão: 1.5-flash ou 2.0-flash para velocidade no WhatsApp)
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  }
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
    // Preparação do chat com o histórico
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "Entendido. Estou pronto para ajudar os pacientes de forma profissional e retornar apenas JSON." }] },
        ...conversationHistory.map(msg => ({
          role: msg.role === 'patient' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        }))
      ],
    });

    const result = await chat.sendMessage(patientMessage);
    const responseText = result.response.text() || '{}';

    let parsed;
    try {
      // Remove possíveis blocos de código Markdown que a IA possa enviar por engano
      const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error("Erro ao parsear JSON da IA:", responseText);
      return {
        message: "Desculpe, tive um problema ao processar sua mensagem. Vou transferir você para um atendente.",
        extractedIntent: {
          intent: 'falar_com_humano',
          confidence: 0.5,
          reason: 'Erro de formatação na resposta da IA'
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
        reason: 'Erro técnico na API'
      }
    };
  }
}