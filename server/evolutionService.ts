import axios from "axios";

function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  
  let sanitized = url.trim();
  
  while (sanitized.endsWith("/")) {
    sanitized = sanitized.slice(0, -1);
  }
  
  if (sanitized && !sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
    sanitized = "https://" + sanitized;
  }
  
  return sanitized;
}

const EVO_URL = sanitizeUrl(process.env.EVO_URL || process.env.EVO_BASE_URL);
const EVO_KEY = (process.env.EVO_KEY || "").trim();
const EVO_INSTANCE = (process.env.EVO_INSTANCE || "clinica_odonto").trim();

console.log("🔧 [Evolution] Configuração carregada:");
console.log(`   - EVO_URL: ${EVO_URL || "(não configurada)"}`);
console.log(`   - EVO_KEY: ${EVO_KEY ? `${EVO_KEY.substring(0, 8)}...` : "(não configurada)"}`);
console.log(`   - EVO_INSTANCE: ${EVO_INSTANCE}`);

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

function handleAxiosError(error: any, context: string): string {
  console.error(`❌ [Evolution] Erro em ${context}:`);
  
  if (error.code) {
    console.error(`   - Código de erro: ${error.code}`);
  }
  
  if (error.response) {
    console.error(`   - Status HTTP: ${error.response.status}`);
    console.error(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
  } else if (error.request) {
    console.error(`   - Sem resposta do servidor (timeout ou conexão recusada)`);
    console.error(`   - Request URL: ${error.config?.url}`);
  } else {
    console.error(`   - Mensagem: ${error.message}`);
  }
  
  return error.response?.data?.message || error.message || "Erro desconhecido";
}

export async function createOrGetInstance(): Promise<EvolutionInstanceResult> {
  if (!EVO_URL) {
    const errorMsg = "Evolution API não configurada: EVO_URL está vazia ou inválida";
    console.error(`❌ [Evolution] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
  
  if (!EVO_KEY) {
    const errorMsg = "Evolution API não configurada: EVO_KEY está vazia";
    console.error(`❌ [Evolution] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  try {
    const fetchInstancesUrl = `${EVO_URL}/instance/fetchInstances`;
    console.log(`🔍 [Evolution] GET ${fetchInstancesUrl}`);
    
    const checkResponse = await axios.get(fetchInstancesUrl, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 15000,
    });

    console.log(`✅ [Evolution] fetchInstances respondeu com ${checkResponse.data?.length || 0} instância(s)`);

    const instances = checkResponse.data || [];
    const existingInstance = instances.find((inst: any) => inst.instance?.instanceName === EVO_INSTANCE);

    if (existingInstance) {
      const instanceStatus = existingInstance.instance?.status;
      console.log(`✅ [Evolution] Instância '${EVO_INSTANCE}' encontrada. Status: ${instanceStatus}`);
      
      if (instanceStatus === "open") {
        return { 
          success: true, 
          status: "connected",
          qrCode: undefined 
        };
      }

      const connectUrl = `${EVO_URL}/instance/connect/${EVO_INSTANCE}`;
      console.log(`📱 [Evolution] GET ${connectUrl}`);
      
      const qrResponse = await axios.get(connectUrl, {
        headers: {
          "apikey": EVO_KEY,
        },
        timeout: 15000,
      });

      console.log(`✅ [Evolution] QR Code recebido`);

      return {
        success: true,
        qrCode: qrResponse.data?.base64 || qrResponse.data?.qrcode?.base64,
        status: "awaiting_scan",
      };
    }

    const createUrl = `${EVO_URL}/instance/create`;
    console.log(`🆕 [Evolution] POST ${createUrl}`);
    console.log(`   - instanceName: ${EVO_INSTANCE}`);
    
    const createResponse = await axios.post(
      createUrl,
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

    console.log(`✅ [Evolution] Instância criada com sucesso`);

    return {
      success: true,
      qrCode: createResponse.data?.qrcode?.base64,
      status: "awaiting_scan",
    };

  } catch (error: any) {
    const errorMessage = handleAxiosError(error, "createOrGetInstance");
    return { success: false, error: errorMessage };
  }
}

export async function sendEvolutionMessage(phone: string, text: string): Promise<EvolutionSendResult> {
  if (!EVO_URL || !EVO_KEY) {
    const errorMsg = "Evolution API não configurada (EVO_URL ou EVO_KEY ausentes)";
    console.warn(`⚠️ [Evolution] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  try {
    const normalizedPhone = phone.replace(/\D/g, "");
    const sendUrl = `${EVO_URL}/message/sendText/${EVO_INSTANCE}`;
    
    console.log(`📤 [Evolution] POST ${sendUrl}`);
    console.log(`   - number: ${normalizedPhone}`);
    console.log(`   - text: ${text.substring(0, 50)}...`);
    
    const response = await axios.post(
      sendUrl,
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
    const errorMessage = handleAxiosError(error, "sendEvolutionMessage");
    return { success: false, error: errorMessage };
  }
}

export function isEvolutionConfigured(): boolean {
  const configured = !!(EVO_URL && EVO_KEY);
  if (!configured) {
    console.log(`ℹ️ [Evolution] API não configurada. EVO_URL: ${EVO_URL ? "OK" : "FALTANDO"}, EVO_KEY: ${EVO_KEY ? "OK" : "FALTANDO"}`);
  }
  return configured;
}

export function getEvolutionInstanceName(): string {
  return EVO_INSTANCE;
}

export function getEvolutionUrl(): string {
  return EVO_URL;
}
