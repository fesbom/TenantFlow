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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createInstance(): Promise<EvolutionInstanceResult> {
  const url = `${EVO_URL}/instance/create`;
  
  const requestBody = {
    instanceName: EVO_INSTANCE,
    token: EVO_TOKEN,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS"
  };
  
  console.log(`\n🆕 [Evolution] POST ${url}`);
  console.log(`   - Request Body:`, JSON.stringify(requestBody, null, 2));
  
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      url,
      requestBody,
      {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json",
        },
        timeout: 90000,
      }
    );

    const elapsedTime = Date.now() - startTime;
    
    console.log(`⏱️ [Evolution] Tempo de resposta: ${elapsedTime}ms`);
    console.log(`📋 [Evolution] Resposta:`);
    console.log(JSON.stringify(response.data, null, 2));

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
    const elapsedTime = Date.now() - startTime;
    
    console.error(`❌ [Evolution] Erro no create após ${elapsedTime}ms:`);
    
    if (error.response) {
      console.error(`   - Status HTTP: ${error.response.status}`);
      console.error(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`   - Erro: ${error.message}`);
    }
    
    throw error;
  }
}

async function tryConnectInstance(): Promise<EvolutionInstanceResult> {
  const url = `${EVO_URL}/instance/connect/${EVO_INSTANCE}`;
  console.log(`\n📱 [Evolution] GET ${url}`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.get(url, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 90000,
    });

    const elapsedTime = Date.now() - startTime;
    
    console.log(`⏱️ [Evolution] Tempo de resposta: ${elapsedTime}ms`);
    console.log(`📋 [Evolution] Resposta:`);
    console.log(JSON.stringify(response.data, null, 2));

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
    const elapsedTime = Date.now() - startTime;
    
    console.error(`❌ [Evolution] Erro no connect após ${elapsedTime}ms:`);
    
    if (error.response) {
      console.error(`   - Status HTTP: ${error.response.status}`);
      console.error(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`   - Erro: ${error.message}`);
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

  console.log(`\n🔄 [Evolution] ========== SETUP WHATSAPP ==========`);
  console.log(`⏰ [Evolution] Timestamp: ${new Date().toISOString()}`);
  console.log(`🔗 [Evolution] EVO_URL: ${EVO_URL}`);
  console.log(`📛 [Evolution] Instância: ${EVO_INSTANCE}`);
  console.log(`⏳ [Evolution] Timeout: 90000ms`);
  
  // Ir direto para POST /instance/create
  console.log(`\n📍 [Evolution] Executando POST /instance/create...`);
  
  try {
    const createResult = await createInstance();
    
    if (createResult.status === "connected") {
      console.log(`✅ [Evolution] Instância conectada!`);
      return createResult;
    }
    
    if (createResult.qrCode) {
      console.log(`✅ [Evolution] QR Code gerado com sucesso!`);
      return createResult;
    }
    
    // Se não veio QR na criação, tentar connect
    console.log(`\n📍 [Evolution] QR não veio no create. Tentando connect...`);
    await sleep(2000);
    
    const connectResult = await tryConnectInstance();
    
    if (connectResult.qrCode) {
      console.log(`✅ [Evolution] QR Code obtido via connect!`);
      return connectResult;
    }
    
    if (connectResult.status === "connected" || connectResult.status === "open") {
      console.log(`✅ [Evolution] Instância conectada!`);
      return { success: true, status: "connected" };
    }
    
    console.log(`⚠️ [Evolution] Concluído sem QR Code`);
    return connectResult;
    
  } catch (createError: any) {
    const status = createError.response?.status;
    const responseData = createError.response?.data;
    const message = responseData?.response?.message?.[0] || 
                    responseData?.message || "";
    
    console.log(`⚠️ [Evolution] Create falhou. Status: ${status}, Mensagem: ${message}`);
    
    // Se instância já existe, tentar conectar
    if (status === 403 || message.includes("already") || message.includes("in use")) {
      console.log(`\n📍 [Evolution] Instância já existe. Tentando connect...`);
      
      try {
        const connectResult = await tryConnectInstance();
        
        if (connectResult.qrCode) {
          console.log(`✅ [Evolution] QR Code obtido via connect!`);
          return connectResult;
        }
        
        if (connectResult.status === "connected" || connectResult.status === "open") {
          console.log(`✅ [Evolution] Instância conectada!`);
          return { success: true, status: "connected", rawResponse: connectResult.rawResponse };
        }
        
        console.log(`⚠️ [Evolution] Concluído sem QR Code`);
        return connectResult;
        
      } catch (connectError: any) {
        console.error(`❌ [Evolution] Erro no connect: ${connectError.message}`);
        return { success: false, error: connectError.message };
      }
    }
    
    return { success: false, error: message || createError.message };
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
    
    const startTime = Date.now();
    
    const response = await axios.post(
      sendUrl,
      {
        number: normalizedPhone,
        text: text,
        delay: 1200,
        linkPreview: true,
      },
      {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const elapsedTime = Date.now() - startTime;
    console.log(`✅ [Evolution] Mensagem enviada em ${elapsedTime}ms. ID: ${response.data?.key?.id || "N/A"}`);
    
    return {
      success: true,
      messageId: response.data?.key?.id,
    };
  } catch (error: any) {
    console.error(`❌ [Evolution] Erro ao enviar mensagem:`);
    if (error.response?.data) {
      console.error(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, error: error.message };
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
