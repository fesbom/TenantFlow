import axios from "axios";

const EVO_BASE_URL = process.env.EVO_BASE_URL || "";
const EVO_KEY = process.env.EVO_KEY || "";
const EVO_INSTANCE = process.env.EVO_INSTANCE || "clinica_principal";

export interface EvolutionSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EvolutionInstanceResult {
  success: boolean;
  qrCode?: string;
  error?: string;
  status?: string;
}

export async function createOrGetInstance(): Promise<EvolutionInstanceResult> {
  if (!EVO_BASE_URL || !EVO_KEY) {
    return { success: false, error: "Evolution API não configurada (EVO_BASE_URL ou EVO_KEY ausentes)" };
  }

  try {
    const checkResponse = await axios.get(
      `${EVO_BASE_URL}/instance/fetchInstances`,
      {
        headers: {
          "apikey": EVO_KEY,
        },
        timeout: 15000,
      }
    );

    const instances = checkResponse.data || [];
    const existingInstance = instances.find((inst: any) => inst.instance?.instanceName === EVO_INSTANCE);

    if (existingInstance) {
      console.log(`✅ [Evolution] Instância '${EVO_INSTANCE}' já existe.`);
      
      if (existingInstance.instance?.status === "open") {
        return { 
          success: true, 
          status: "connected",
          qrCode: undefined 
        };
      }

      const qrResponse = await axios.get(
        `${EVO_BASE_URL}/instance/connect/${EVO_INSTANCE}`,
        {
          headers: {
            "apikey": EVO_KEY,
          },
          timeout: 15000,
        }
      );

      return {
        success: true,
        qrCode: qrResponse.data?.base64 || qrResponse.data?.qrcode?.base64,
        status: "awaiting_scan",
      };
    }

    console.log(`🆕 [Evolution] Criando instância '${EVO_INSTANCE}'...`);
    
    const createResponse = await axios.post(
      `${EVO_BASE_URL}/instance/create`,
      {
        instanceName: EVO_INSTANCE,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      },
      {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return {
      success: true,
      qrCode: createResponse.data?.qrcode?.base64,
      status: "awaiting_scan",
    };

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Erro desconhecido";
    console.error(`❌ [Evolution] Erro:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function sendEvolutionMessage(phone: string, text: string): Promise<EvolutionSendResult> {
  if (!EVO_BASE_URL || !EVO_KEY) {
    console.warn("⚠️ Evolution API não configurada (EVO_BASE_URL ou EVO_KEY ausentes)");
    return { success: false, error: "Evolution API não configurada" };
  }

  try {
    const normalizedPhone = phone.replace(/\D/g, "");
    
    console.log(`📤 [Evolution] Enviando mensagem para ${normalizedPhone}...`);
    
    const response = await axios.post(
      `${EVO_BASE_URL}/message/sendText/${EVO_INSTANCE}`,
      {
        number: normalizedPhone,
        text: text,
      },
      {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    console.log(`✅ [Evolution] Mensagem enviada. ID: ${response.data?.key?.id || "N/A"}`);
    
    return {
      success: true,
      messageId: response.data?.key?.id,
    };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Erro desconhecido";
    console.error(`❌ [Evolution] Erro ao enviar mensagem:`, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function isEvolutionConfigured(): boolean {
  return !!(EVO_BASE_URL && EVO_KEY);
}
