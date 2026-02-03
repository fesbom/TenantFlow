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

async function tryConnectInstance(): Promise<EvolutionInstanceResult> {
  const connectUrl = `${EVO_URL}/instance/connect/${EVO_INSTANCE}`;
  console.log(`📱 [Evolution] GET ${connectUrl}`);
  
  const response = await axios.get(connectUrl, {
    headers: {
      "apikey": EVO_KEY,
    },
    timeout: 20000,
  });

  const qrCode = response.data?.base64 || response.data?.qrcode?.base64;
  
  if (qrCode) {
    console.log(`✅ [Evolution] QR Code recebido da instância existente`);
    return {
      success: true,
      qrCode,
      status: "awaiting_scan",
    };
  }

  if (response.data?.instance?.state === "open" || response.data?.state === "open") {
    console.log(`✅ [Evolution] Instância já está conectada`);
    return {
      success: true,
      status: "connected",
    };
  }

  console.log(`ℹ️ [Evolution] Resposta do connect:`, JSON.stringify(response.data, null, 2));
  return {
    success: true,
    status: response.data?.instance?.state || response.data?.state || "unknown",
  };
}

async function createInstance(): Promise<EvolutionInstanceResult> {
  const createUrl = `${EVO_URL}/instance/create`;
  console.log(`🆕 [Evolution] POST ${createUrl}`);
  console.log(`   - instanceName: ${EVO_INSTANCE}`);
  
  const response = await axios.post(
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
    qrCode: response.data?.qrcode?.base64,
    status: "awaiting_scan",
  };
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
    console.log(`🔄 [Evolution] Tentando conectar à instância existente '${EVO_INSTANCE}'...`);
    return await tryConnectInstance();
    
  } catch (connectError: any) {
    const status = connectError.response?.status;
    const errorMessage = connectError.response?.data?.message || "";
    
    console.log(`ℹ️ [Evolution] Conexão falhou. Status: ${status}, Mensagem: ${errorMessage}`);

    if (status === 404 || errorMessage.includes("not found") || errorMessage.includes("não encontrada")) {
      console.log(`🆕 [Evolution] Instância não existe. Criando nova...`);
      
      try {
        return await createInstance();
      } catch (createError: any) {
        const createStatus = createError.response?.status;
        const createMessage = createError.response?.data?.message || "";
        
        if (createStatus === 403 || createMessage.includes("already") || createMessage.includes("existe")) {
          console.log(`ℹ️ [Evolution] Instância já existe (erro de criação). Tentando conectar novamente...`);
          
          try {
            return await tryConnectInstance();
          } catch (retryError: any) {
            const errorMsg = handleAxiosError(retryError, "tryConnectInstance (retry)");
            return { success: false, error: errorMsg };
          }
        }
        
        const errorMsg = handleAxiosError(createError, "createInstance");
        return { success: false, error: errorMsg };
      }
    }

    if (status === 403 || errorMessage.includes("already") || errorMessage.includes("in use")) {
      console.log(`ℹ️ [Evolution] Instância existe mas está em uso. Buscando estado...`);
      
      try {
        const stateUrl = `${EVO_URL}/instance/connectionState/${EVO_INSTANCE}`;
        console.log(`🔍 [Evolution] GET ${stateUrl}`);
        
        const stateResponse = await axios.get(stateUrl, {
          headers: {
            "apikey": EVO_KEY,
          },
          timeout: 15000,
        });

        const state = stateResponse.data?.instance?.state || stateResponse.data?.state;
        console.log(`ℹ️ [Evolution] Estado da instância: ${state}`);

        if (state === "open") {
          return { success: true, status: "connected" };
        }

        return await tryConnectInstance();
        
      } catch (stateError: any) {
        console.log(`⚠️ [Evolution] Erro ao buscar estado. Tentando conectar diretamente...`);
        
        try {
          return await tryConnectInstance();
        } catch (finalError: any) {
          const errorMsg = handleAxiosError(finalError, "tryConnectInstance (final)");
          return { success: false, error: errorMsg };
        }
      }
    }

    const errorMsg = handleAxiosError(connectError, "createOrGetInstance");
    return { success: false, error: errorMsg };
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
