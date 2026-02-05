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

async function fetchAllInstances(): Promise<any> {
  const url = `${EVO_URL}/instance/fetchInstances`;
  console.log(`\n🔍 [Evolution] ========== FETCH INSTANCES ==========`);
  console.log(`📍 [Evolution] URL exata: ${url}`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.get(url, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 60000,
    });
    
    const elapsedTime = Date.now() - startTime;
    
    console.log(`⏱️ [Evolution] Tempo de resposta: ${elapsedTime}ms`);
    console.log(`📋 [Evolution] Resposta fetchInstances:`);
    console.log(JSON.stringify(response.data, null, 2));
    
    if (Array.isArray(response.data)) {
      console.log(`📊 [Evolution] Total de instâncias: ${response.data.length}`);
      response.data.forEach((inst: any, idx: number) => {
        console.log(`   ${idx + 1}. ${inst.instance?.instanceName || inst.name || 'N/A'} - Estado: ${inst.instance?.state || inst.state || 'N/A'}`);
        if (inst.instance?.connectionStatus) {
          console.log(`      - connectionStatus: ${JSON.stringify(inst.instance.connectionStatus)}`);
        }
      });
    }
    
    return response.data;
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    console.error(`❌ [Evolution] Erro em fetchInstances após ${elapsedTime}ms:`);
    
    if (error.response) {
      console.error(`   - Status HTTP: ${error.response.status}`);
      console.error(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.code) {
      console.error(`   - Código de erro: ${error.code}`);
      console.error(`   - Mensagem: ${error.message}`);
    }
    
    if (error.toJSON) {
      console.error(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    
    return null;
  }
}

async function getConnectionState(): Promise<{ state: string; connected: boolean }> {
  const url = `${EVO_URL}/instance/connectionState/${EVO_INSTANCE}`;
  console.log(`\n🔍 [Evolution] GET ${url}`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.get(url, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 60000,
    });
    
    const elapsedTime = Date.now() - startTime;
    console.log(`⏱️ [Evolution] Tempo de resposta: ${elapsedTime}ms`);
    console.log(`📋 [Evolution] Resposta connectionState:`);
    console.log(JSON.stringify(response.data, null, 2));
    
    const state = response.data?.instance?.state || 
                  response.data?.state || 
                  "unknown";
    const connected = state === "open" || state === "connected";
    
    console.log(`📊 [Evolution] Estado atual: ${state} (conectado: ${connected})`);
    
    return { state, connected };
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    const status = error.response?.status;
    
    if (status === 404) {
      console.log(`ℹ️ [Evolution] Instância não existe (404) - ${elapsedTime}ms`);
      return { state: "NOT_FOUND", connected: false };
    }
    
    console.log(`⚠️ [Evolution] Erro ao verificar estado após ${elapsedTime}ms: ${error.message}`);
    if (error.response?.data) {
      console.log(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
    }
    if (error.toJSON) {
      console.log(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    return { state: "ERROR", connected: false };
  }
}

async function logoutInstance(): Promise<void> {
  const url = `${EVO_URL}/instance/logout/${EVO_INSTANCE}`;
  console.log(`\n🔓 [Evolution] DELETE ${url}`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.delete(url, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 60000,
    });
    
    const elapsedTime = Date.now() - startTime;
    console.log(`✅ [Evolution] Logout realizado com sucesso - ${elapsedTime}ms`);
    console.log(`   - Response:`, JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    const status = error.response?.status;
    
    if (status === 404 || status === 400) {
      console.log(`ℹ️ [Evolution] Logout não necessário (${status}) - ${elapsedTime}ms`);
    } else {
      console.log(`⚠️ [Evolution] Erro no logout após ${elapsedTime}ms: ${error.message}`);
      if (error.response?.data) {
        console.log(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
      }
    }
  }
}

async function deleteInstance(): Promise<boolean> {
  const url = `${EVO_URL}/instance/delete/${EVO_INSTANCE}`;
  console.log(`\n🗑️ [Evolution] DELETE ${url}`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.delete(url, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 60000,
    });
    
    const elapsedTime = Date.now() - startTime;
    console.log(`✅ [Evolution] Instância '${EVO_INSTANCE}' deletada com sucesso - ${elapsedTime}ms`);
    console.log(`   - Response:`, JSON.stringify(response.data, null, 2));
    return true;
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    const status = error.response?.status;
    
    if (status === 404) {
      console.log(`ℹ️ [Evolution] Instância não encontrada (404) - ${elapsedTime}ms - OK`);
      return true;
    }
    
    console.log(`⚠️ [Evolution] Erro ao deletar após ${elapsedTime}ms: ${error.message}`);
    if (error.response?.data) {
      console.log(`   - Response data:`, JSON.stringify(error.response.data, null, 2));
    }
    if (error.toJSON) {
      console.log(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    return false;
  }
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
  console.log(`📍 [Evolution] URL exata: ${url}`);
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
        timeout: 60000,
      }
    );

    const elapsedTime = Date.now() - startTime;
    
    console.log(`\n⏱️ [Evolution] Tempo de resposta: ${elapsedTime}ms`);
    console.log(`📋 [Evolution] ========== RESPOSTA COMPLETA DO CREATE ==========`);
    console.log(JSON.stringify(response.data, null, 2));
    console.log(`📋 [Evolution] ========== FIM DA RESPOSTA ==========\n`);

    // Verificar status do banco de dados se retornado
    if (response.data?.database) {
      console.log(`🗃️ [Evolution] Status do banco de dados: ${JSON.stringify(response.data.database)}`);
    }

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
    
    console.error(`\n❌ [Evolution] Erro no create após ${elapsedTime}ms:`);
    console.error(`📍 [Evolution] URL exata: ${url}`);
    
    if (error.response) {
      console.error(`   - Status HTTP: ${error.response.status}`);
      console.error(`   - error.response.data (COMPLETO):`);
      console.error(JSON.stringify(error.response.data, null, 2));
      
      // Verificar status do banco de dados na resposta de erro
      if (error.response.data?.database) {
        console.error(`🗃️ [Evolution] Status do banco de dados (erro): ${JSON.stringify(error.response.data.database)}`);
      }
    }
    
    if (error.toJSON) {
      console.error(`   - Error.toJSON():`, JSON.stringify(error.toJSON(), null, 2));
    }
    
    throw error;
  }
}

async function tryConnectInstance(): Promise<EvolutionInstanceResult> {
  const url = `${EVO_URL}/instance/connect/${EVO_INSTANCE}`;
  console.log(`\n📱 [Evolution] GET ${url}`);
  console.log(`📍 [Evolution] URL exata: ${url}`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.get(url, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 60000,
    });

    const elapsedTime = Date.now() - startTime;
    
    console.log(`\n⏱️ [Evolution] Tempo de resposta: ${elapsedTime}ms`);
    console.log(`📋 [Evolution] ========== RESPOSTA COMPLETA DO CONNECT ==========`);
    console.log(JSON.stringify(response.data, null, 2));
    console.log(`📋 [Evolution] ========== FIM DA RESPOSTA ==========\n`);

    // Verificar status do banco de dados se retornado
    if (response.data?.database) {
      console.log(`🗃️ [Evolution] Status do banco de dados: ${JSON.stringify(response.data.database)}`);
    }

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
    console.error(`📍 [Evolution] URL exata: ${url}`);
    
    if (error.response) {
      console.error(`   - Status HTTP: ${error.response.status}`);
      console.error(`   - error.response.data (COMPLETO):`);
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    
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

  console.log(`\n🔄 [Evolution] ========== DIAGNÓSTICO PROFUNDO - INÍCIO ==========`);
  console.log(`⏰ [Evolution] Timestamp: ${new Date().toISOString()}`);
  console.log(`🔗 [Evolution] EVO_URL: ${EVO_URL}`);
  console.log(`📛 [Evolution] Instância: ${EVO_INSTANCE}`);
  console.log(`⏳ [Evolution] Timeout configurado: 60000ms`);
  
  // PASSO 0: Listar todas as instâncias existentes
  console.log(`\n📍 [Evolution] PASSO 0: Listando todas as instâncias...`);
  const allInstances = await fetchAllInstances();
  
  // PASSO 1: Verificar estado atual da conexão
  console.log(`\n📍 [Evolution] PASSO 1: Verificando estado da conexão...`);
  const { state, connected } = await getConnectionState();
  
  if (connected) {
    console.log(`\n✅ [Evolution] ========== INSTÂNCIA JÁ CONECTADA ==========\n`);
    return { success: true, status: "connected" };
  }
  
  // PASSO 2: Se DISCONNECTED ou existe, forçar DELETE
  if (state === "close" || state === "DISCONNECTED" || state === "connecting" || state !== "NOT_FOUND") {
    console.log(`\n📍 [Evolution] PASSO 2: Estado '${state}' detectado. Forçando limpeza...`);
    
    // Logout primeiro
    console.log(`   - Executando logout...`);
    await logoutInstance();
    await sleep(1000);
    
    // Delete
    console.log(`   - Executando delete...`);
    const deleted = await deleteInstance();
    if (deleted) {
      console.log(`   - Aguardando 3 segundos após delete...`);
      await sleep(3000);
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
    await sleep(2000);
    
    const connectResult = await tryConnectInstance();
    
    if (connectResult.qrCode) {
      console.log(`\n✅ [Evolution] ========== QR CODE OBTIDO VIA CONNECT ==========\n`);
      return connectResult;
    }
    
    if (connectResult.status === "connected" || connectResult.status === "open") {
      console.log(`\n✅ [Evolution] ========== INSTÂNCIA CONECTADA ==========\n`);
      return { success: true, status: "connected" };
    }
    
    console.log(`\n⚠️ [Evolution] ========== DIAGNÓSTICO CONCLUÍDO SEM QR CODE ==========\n`);
    return connectResult;
    
  } catch (createError: any) {
    const status = createError.response?.status;
    const responseData = createError.response?.data;
    const message = responseData?.response?.message?.[0] || 
                    responseData?.message || "";
    
    console.log(`\n⚠️ [Evolution] Create falhou. Status: ${status}, Mensagem: ${message}`);
    console.log(`   - error.response.data completo:`, JSON.stringify(responseData, null, 2));
    
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
        
        console.log(`\n⚠️ [Evolution] ========== DIAGNÓSTICO CONCLUÍDO SEM QR CODE ==========\n`);
        return connectResult;
        
      } catch (connectError: any) {
        console.error(`❌ [Evolution] Erro no connect:`);
        if (connectError.response?.data) {
          console.error(`   - error.response.data completo:`, JSON.stringify(connectError.response.data, null, 2));
        }
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
      console.error(`   - error.response.data:`, JSON.stringify(error.response.data, null, 2));
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
