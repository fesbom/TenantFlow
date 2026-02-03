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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteInstance(): Promise<void> {
  const deleteUrl = `${EVO_URL}/instance/delete/${EVO_INSTANCE}`;
  console.log(`🗑️ [Evolution] DELETE ${deleteUrl}`);
  
  try {
    await axios.delete(deleteUrl, {
      headers: {
        "apikey": EVO_KEY,
      },
      timeout: 15000,
    });
    console.log(`✅ [Evolution] Instância '${EVO_INSTANCE}' deletada com sucesso`);
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 404) {
      console.log(`ℹ️ [Evolution] Instância não encontrada (404) - OK, continuando...`);
    } else {
      console.log(`⚠️ [Evolution] Erro ao deletar (ignorando): ${error.response?.data?.message || error.message}`);
    }
  }
}

async function createInstance(): Promise<EvolutionInstanceResult> {
  const createUrl = `${EVO_URL}/instance/create`;
  console.log(`🆕 [Evolution] POST ${createUrl}`);
  console.log(`   - instanceName: ${EVO_INSTANCE}`);
  console.log(`   - qrcode: true`);
  
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

  console.log(`✅ [Evolution] Resposta do create:`);
  console.log(JSON.stringify(response.data, null, 2));

  const qrCode = response.data?.qrcode?.base64 || response.data?.base64;
  
  if (qrCode) {
    console.log(`✅ [Evolution] QR Code capturado com sucesso (${qrCode.length} caracteres)`);
  } else {
    console.log(`⚠️ [Evolution] base64 vazio! JSON completo da resposta:`);
    console.log(JSON.stringify(response.data, null, 2));
  }

  return {
    success: true,
    qrCode,
    status: "awaiting_scan",
  };
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

  console.log(`✅ [Evolution] Resposta do connect:`);
  console.log(JSON.stringify(response.data, null, 2));

  const qrCode = response.data?.base64 || response.data?.qrcode?.base64;
  
  if (qrCode) {
    console.log(`✅ [Evolution] QR Code recebido (${qrCode.length} caracteres)`);
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

  console.log(`⚠️ [Evolution] base64 vazio no connect! JSON completo:`);
  console.log(JSON.stringify(response.data, null, 2));
  
  return {
    success: true,
    status: response.data?.instance?.state || response.data?.state || "unknown",
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

  console.log(`\n🔄 [Evolution] ========== INÍCIO DO SETUP ==========`);
  
  // PASSO 1: Deletar instância existente (limpar cache)
  console.log(`\n📍 [Evolution] PASSO 1: Deletando instância existente...`);
  await deleteInstance();
  
  // PASSO 2: Aguardar 1 segundo
  console.log(`\n📍 [Evolution] PASSO 2: Aguardando 1 segundo...`);
  await sleep(1000);
  
  // PASSO 3: Tentar criar nova instância
  console.log(`\n📍 [Evolution] PASSO 3: Criando nova instância...`);
  
  try {
    const createResult = await createInstance();
    
    if (createResult.qrCode) {
      console.log(`\n✅ [Evolution] ========== SETUP CONCLUÍDO COM SUCESSO ==========\n`);
      return createResult;
    }
    
    // Se não veio QR na criação, tentar connect
    console.log(`\n📍 [Evolution] PASSO 4: QR não veio na criação. Tentando connect...`);
    await sleep(500);
    
    const connectResult = await tryConnectInstance();
    
    if (connectResult.qrCode) {
      console.log(`\n✅ [Evolution] ========== SETUP CONCLUÍDO COM SUCESSO ==========\n`);
      return connectResult;
    }
    
    console.log(`\n⚠️ [Evolution] ========== SETUP CONCLUÍDO SEM QR CODE ==========\n`);
    return connectResult;
    
  } catch (createError: any) {
    const status = createError.response?.status;
    const message = createError.response?.data?.response?.message?.[0] || 
                    createError.response?.data?.message || "";
    
    console.log(`⚠️ [Evolution] Create falhou. Status: ${status}, Mensagem: ${message}`);
    
    // Se instância já existe, tentar conectar
    if (status === 403 || message.includes("already") || message.includes("in use")) {
      console.log(`\n📍 [Evolution] PASSO 4: Instância existe. Tentando connect...`);
      
      try {
        const connectResult = await tryConnectInstance();
        
        if (connectResult.qrCode) {
          console.log(`\n✅ [Evolution] ========== SETUP CONCLUÍDO COM SUCESSO ==========\n`);
          return connectResult;
        }
        
        if (connectResult.status === "connected" || connectResult.status === "open") {
          console.log(`\n✅ [Evolution] ========== INSTÂNCIA JÁ CONECTADA ==========\n`);
          return { success: true, status: "connected" };
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
