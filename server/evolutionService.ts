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

const EVO_URL = sanitizeUrl((process.env.EVO_URL || process.env.EVO_BASE_URL || "").trim());
const EVO_KEY = (process.env.EVO_KEY || "").trim();
const EVO_INSTANCE = (process.env.EVO_INSTANCE || "denticare").trim();
const EVO_TOKEN = (process.env.EVO_TOKEN || "token123").trim();
const WEBHOOK_GLOBAL_URL = sanitizeUrl((process.env.WEBHOOK_GLOBAL_URL || "").trim());

console.log("🔧 [Evolution] Configuração carregada:");
console.log(`   - EVO_URL: ${EVO_URL || "(não configurada)"}`);
console.log(`   - EVO_KEY: ${EVO_KEY ? `${EVO_KEY.substring(0, 8)}...` : "(não configurada)"}`);
console.log(`   - EVO_INSTANCE: ${EVO_INSTANCE}`);
console.log(`   - EVO_TOKEN: ${EVO_TOKEN}`);
console.log(`   - WEBHOOK_GLOBAL_URL: ${WEBHOOK_GLOBAL_URL || "(não configurada)"}`);

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
  rawResponse?: any;
}

function handleAxiosError(error: any, context: string): string {
  console.error(`❌ [Evolution] Erro em ${context}:`);
  
  if (error.code) {
    console.error(`   - Código de erro: ${error.code}`);
  }
  
  if (error.toJSON) {
    console.error(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getConnectionState(): Promise<{ state: string; connected: boolean }> {
  const stateUrl = `${EVO_URL}/instance/connectionState/${EVO_INSTANCE}`;
  console.log(`🔍 [Evolution] GET ${stateUrl}`);
  
  try {
    const response = await axios.get(stateUrl, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 10000,
    });
    
    console.log(`📋 [Evolution] Resposta connectionState:`);
    console.log(JSON.stringify(response.data, null, 2));
    
    const state = response.data?.instance?.state || 
                  response.data?.state || 
                  "unknown";
    const connected = state === "open" || state === "connected";
    
    console.log(`📊 [Evolution] Estado atual: ${state} (conectado: ${connected})`);
    
    return { state, connected };
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 404) {
      console.log(`ℹ️ [Evolution] Instância não existe (404)`);
      return { state: "NOT_FOUND", connected: false };
    }
    console.log(`⚠️ [Evolution] Erro ao verificar estado: ${error.message}`);
    if (error.toJSON) {
      console.log(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    return { state: "ERROR", connected: false };
  }
}

async function logoutInstance(): Promise<void> {
  const logoutUrl = `${EVO_URL}/instance/logout/${EVO_INSTANCE}`;
  console.log(`🔓 [Evolution] DELETE ${logoutUrl}`);
  
  try {
    await axios.delete(logoutUrl, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 10000,
    });
    console.log(`✅ [Evolution] Logout realizado com sucesso`);
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 404 || status === 400) {
      console.log(`ℹ️ [Evolution] Logout não necessário (${status})`);
    } else {
      console.log(`⚠️ [Evolution] Erro no logout: ${error.message}`);
      if (error.toJSON) {
        console.log(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
      }
    }
  }
}

async function deleteInstance(): Promise<boolean> {
  const deleteUrl = `${EVO_URL}/instance/delete/${EVO_INSTANCE}`;
  console.log(`🗑️ [Evolution] DELETE ${deleteUrl}`);
  
  try {
    const response = await axios.delete(deleteUrl, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 15000,
    });
    console.log(`✅ [Evolution] Instância '${EVO_INSTANCE}' deletada com sucesso`);
    console.log(`   - Response:`, JSON.stringify(response.data, null, 2));
    return true;
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 404) {
      console.log(`ℹ️ [Evolution] Instância não encontrada (404) - OK`);
      return true;
    }
    console.log(`⚠️ [Evolution] Erro ao deletar: ${error.message}`);
    if (error.toJSON) {
      console.log(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    return false;
  }
}

async function createInstance(): Promise<EvolutionInstanceResult> {
  const createUrl = `${EVO_URL}/instance/create`;
  
  const requestBody = {
    instanceName: EVO_INSTANCE,
    token: EVO_TOKEN,
    qrcode: true
  };
  
  console.log(`🆕 [Evolution] POST ${createUrl}`);
  console.log(`   - Request Body:`, JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await axios.post(
      createUrl,
      requestBody,
      {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    console.log(`\n📋 [Evolution] ========== RESPOSTA COMPLETA DO CREATE ==========`);
    console.log(JSON.stringify(response.data, null, 2));
    console.log(`📋 [Evolution] ========== FIM DA RESPOSTA ==========\n`);

    const instanceState = response.data?.instance?.state || 
                          response.data?.state || 
                          response.data?.status ||
                          "unknown";
    console.log(`📊 [Evolution] Status da instância: ${instanceState}`);

    const qrCode = response.data?.qrcode?.base64 || 
                   response.data?.base64 ||
                   response.data?.qrcode;
    
    if (qrCode && typeof qrCode === 'string' && qrCode.length > 100) {
      console.log(`✅ [Evolution] QR Code capturado com sucesso (${qrCode.length} caracteres)`);
      return {
        success: true,
        qrCode,
        status: instanceState,
        rawResponse: response.data,
      };
    }
    
    console.log(`⚠️ [Evolution] QR Code não encontrado na resposta do create`);
    
    return {
      success: true,
      status: instanceState,
      rawResponse: response.data,
    };
  } catch (error: any) {
    console.error(`❌ [Evolution] Erro no create:`);
    if (error.toJSON) {
      console.error(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    throw error;
  }
}

async function tryConnectInstance(): Promise<EvolutionInstanceResult> {
  const connectUrl = `${EVO_URL}/instance/connect/${EVO_INSTANCE}`;
  console.log(`📱 [Evolution] GET ${connectUrl}`);
  
  try {
    const response = await axios.get(connectUrl, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 20000,
    });

    console.log(`\n📋 [Evolution] ========== RESPOSTA COMPLETA DO CONNECT ==========`);
    console.log(JSON.stringify(response.data, null, 2));
    console.log(`📋 [Evolution] ========== FIM DA RESPOSTA ==========\n`);

    const instanceState = response.data?.instance?.state || 
                          response.data?.state || 
                          "unknown";
    console.log(`📊 [Evolution] Status da instância: ${instanceState}`);

    const qrCode = response.data?.base64 || response.data?.qrcode?.base64;
    
    if (qrCode && typeof qrCode === 'string' && qrCode.length > 100) {
      console.log(`✅ [Evolution] QR Code recebido (${qrCode.length} caracteres)`);
      return {
        success: true,
        qrCode,
        status: instanceState,
        rawResponse: response.data,
      };
    }

    if (instanceState === "open" || instanceState === "connected") {
      console.log(`✅ [Evolution] Instância já está conectada`);
      return {
        success: true,
        status: "connected",
        rawResponse: response.data,
      };
    }

    console.log(`⚠️ [Evolution] QR Code não encontrado no connect`);
    
    return {
      success: true,
      status: instanceState,
      rawResponse: response.data,
    };
  } catch (error: any) {
    console.error(`❌ [Evolution] Erro no connect:`);
    if (error.toJSON) {
      console.error(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    throw error;
  }
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

  console.log(`\n🔄 [Evolution] ========== SETUP RESILIENTE - INÍCIO ==========`);
  console.log(`⏰ [Evolution] Timestamp: ${new Date().toISOString()}`);
  console.log(`🔗 [Evolution] EVO_URL: ${EVO_URL}`);
  console.log(`📛 [Evolution] Instância: ${EVO_INSTANCE}`);
  
  // PASSO 1: Verificar estado atual da conexão
  console.log(`\n📍 [Evolution] PASSO 1: Verificando estado da conexão...`);
  const { state, connected } = await getConnectionState();
  
  if (connected) {
    console.log(`\n✅ [Evolution] ========== INSTÂNCIA JÁ CONECTADA ==========\n`);
    return { success: true, status: "connected" };
  }
  
  // PASSO 2: Se DISCONNECTED ou existe, forçar DELETE
  if (state === "close" || state === "DISCONNECTED" || state !== "NOT_FOUND") {
    console.log(`\n📍 [Evolution] PASSO 2: Estado '${state}' detectado. Forçando limpeza...`);
    
    // Logout primeiro
    console.log(`   - Executando logout...`);
    await logoutInstance();
    await sleep(500);
    
    // Delete
    console.log(`   - Executando delete...`);
    const deleted = await deleteInstance();
    if (deleted) {
      console.log(`   - Aguardando 2 segundos após delete...`);
      await sleep(2000);
    }
  } else {
    console.log(`\n📍 [Evolution] PASSO 2: Instância não existe. Pulando limpeza.`);
  }
  
  // PASSO 3: Criar nova instância
  console.log(`\n📍 [Evolution] PASSO 3: Criando nova instância...`);
  
  try {
    const createResult = await createInstance();
    
    if (createResult.status === "connected") {
      console.log(`\n✅ [Evolution] ========== INSTÂNCIA CONECTADA ==========\n`);
      return createResult;
    }
    
    if (createResult.qrCode) {
      console.log(`\n✅ [Evolution] ========== QR CODE GERADO COM SUCESSO ==========\n`);
      return createResult;
    }
    
    // PASSO 4: Se não veio QR na criação, tentar connect
    console.log(`\n📍 [Evolution] PASSO 4: QR não veio no create. Tentando connect...`);
    await sleep(1000);
    
    const connectResult = await tryConnectInstance();
    
    if (connectResult.qrCode) {
      console.log(`\n✅ [Evolution] ========== QR CODE OBTIDO VIA CONNECT ==========\n`);
      return connectResult;
    }
    
    if (connectResult.status === "connected" || connectResult.status === "open") {
      console.log(`\n✅ [Evolution] ========== INSTÂNCIA CONECTADA ==========\n`);
      return { success: true, status: "connected" };
    }
    
    console.log(`\n⚠️ [Evolution] ========== SETUP CONCLUÍDO SEM QR CODE ==========\n`);
    return connectResult;
    
  } catch (createError: any) {
    const status = createError.response?.status;
    const message = createError.response?.data?.response?.message?.[0] || 
                    createError.response?.data?.message || "";
    
    console.log(`\n⚠️ [Evolution] Create falhou. Status: ${status}, Mensagem: ${message}`);
    
    // Se instância já existe, tentar conectar
    if (status === 403 || message.includes("already") || message.includes("in use")) {
      console.log(`\n📍 [Evolution] PASSO 4: Instância ainda existe. Tentando connect...`);
      
      try {
        const connectResult = await tryConnectInstance();
        
        if (connectResult.qrCode) {
          console.log(`\n✅ [Evolution] ========== QR CODE OBTIDO VIA CONNECT ==========\n`);
          return connectResult;
        }
        
        if (connectResult.status === "connected" || connectResult.status === "open") {
          console.log(`\n✅ [Evolution] ========== INSTÂNCIA CONECTADA ==========\n`);
          return { success: true, status: "connected", rawResponse: connectResult.rawResponse };
        }
        
        console.log(`\n⚠️ [Evolution] ========== SETUP CONCLUÍDO SEM QR CODE ==========\n`);
        return connectResult;
        
      } catch (connectError: any) {
        const errorMsg = handleAxiosError(connectError, "tryConnectInstance");
        return { success: false, error: errorMsg };
      }
    }
    
    const errorMsg = handleAxiosError(createError, "createInstance");
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
