import axios from "axios";

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE || "";
const ZAPI_TOKEN = process.env.ZAPI_TOKEN || "";

const ZAPI_BASE_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

export interface ZApiSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppMessage(phone: string, text: string): Promise<ZApiSendResult> {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    console.warn("⚠️ Z-API não configurada (ZAPI_INSTANCE ou ZAPI_TOKEN ausentes)");
    return { success: false, error: "Z-API não configurada" };
  }

  try {
    const normalizedPhone = phone.replace(/\D/g, "");
    
    console.log(`📤 [Z-API] Enviando mensagem para ${normalizedPhone}...`);
    
    const response = await axios.post(
      `${ZAPI_BASE_URL}/send-text`,
      {
        phone: normalizedPhone,
        message: text,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    console.log(`✅ [Z-API] Mensagem enviada. ID: ${response.data?.messageId || "N/A"}`);
    
    return {
      success: true,
      messageId: response.data?.messageId,
    };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Erro desconhecido";
    console.error(`❌ [Z-API] Erro ao enviar mensagem:`, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function isZApiConfigured(): boolean {
  return !!(ZAPI_INSTANCE && ZAPI_TOKEN);
}
