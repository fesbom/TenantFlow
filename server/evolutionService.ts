import axios from "axios";

export function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  let sanitized = url.trim();
  while (sanitized.endsWith("/")) sanitized = sanitized.slice(0, -1);
  if (sanitized && !sanitized.startsWith("http://") && !sanitized.startsWith("https://"))
    sanitized = "https://" + sanitized;
  return sanitized;
}

// ─── Global env-level defaults (used when clinic has no per-clinic config) ───
const GLOBAL_EVO_URL = sanitizeUrl(
  (process.env.EVO_URL || process.env.EVO_BASE_URL || "").trim(),
);
const GLOBAL_EVO_KEY = (process.env.EVO_KEY || "").trim();
const GLOBAL_EVO_INSTANCE = (process.env.EVO_INSTANCE || "denticare").trim();
const WEBHOOK_GLOBAL_URL = sanitizeUrl(
  (process.env.WEBHOOK_GLOBAL_URL || "").trim(),
);

// In development, webhooks must reach the dev server, not the deployed app.
// REPLIT_DEV_DOMAIN is the public URL of this workspace.
export function getWebhookUrl(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const devDomain = (process.env.REPLIT_DEV_DOMAIN || "").trim();
  if (isDev && devDomain) {
    return `https://${devDomain}/webhook/evolution`;
  }
  if (!WEBHOOK_GLOBAL_URL) return "";
  return WEBHOOK_GLOBAL_URL.endsWith("/webhook/evolution")
    ? WEBHOOK_GLOBAL_URL
    : `${WEBHOOK_GLOBAL_URL}/webhook/evolution`;
}

console.log("🔧 [Evolution] Configuração global:");
console.log(`   - EVO_URL: ${GLOBAL_EVO_URL || "(não configurada)"}`);
console.log(`   - EVO_KEY: ${GLOBAL_EVO_KEY ? "(configurada)" : "(não configurada)"}`);
console.log(`   - EVO_INSTANCE: ${GLOBAL_EVO_INSTANCE}`);
console.log(`   - WEBHOOK_GLOBAL_URL: ${WEBHOOK_GLOBAL_URL || "(não configurada)"}`);

// ─── Per-clinic config type ────────────────────────────────────────────────
export interface ClinicEvolutionConfig {
  evoUrl: string;
  evoKey: string;
  instanceName: string;
}

export function buildClinicConfig(clinic: {
  evolutionInstanceName?: string | null;
  evolutionApiKey?: string | null;
}): ClinicEvolutionConfig {
  return {
    evoUrl: GLOBAL_EVO_URL,
    evoKey: (clinic.evolutionApiKey || GLOBAL_EVO_KEY).trim(),
    instanceName: (clinic.evolutionInstanceName || GLOBAL_EVO_INSTANCE).trim(),
  };
}

export function globalConfig(): ClinicEvolutionConfig {
  return {
    evoUrl: GLOBAL_EVO_URL,
    evoKey: GLOBAL_EVO_KEY,
    instanceName: GLOBAL_EVO_INSTANCE,
  };
}

// ─── Interfaces ───────────────────────────────────────────────────────────
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

export interface EvolutionStatusResult {
  connected: boolean;
  phone?: string;
  profileName?: string;
  status?: string;
}

// ─── Per-clinic: send message ──────────────────────────────────────────────
export async function sendEvolutionMessageForClinic(
  config: ClinicEvolutionConfig,
  phone: string,
  text: string,
): Promise<EvolutionSendResult> {
  if (!config.evoUrl || !config.evoKey || !config.instanceName) {
    return { success: false, error: "Evolution API não configurada para esta clínica" };
  }
  try {
    const normalizedPhone = phone.replace(/\D/g, "");
    const sendUrl = `${config.evoUrl}/message/sendText/${config.instanceName}`;
    const response = await axios.post(
      sendUrl,
      { number: normalizedPhone, text, delay: 1200, linkPreview: true },
      {
        headers: { apikey: config.evoKey, "Content-Type": "application/json" },
        timeout: 30000,
      },
    );
    return { success: true, messageId: response.data?.key?.id };
  } catch (error: any) {
    console.error(`❌ [Evolution] Erro ao enviar para ${config.instanceName}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ─── Per-clinic: get instance status ──────────────────────────────────────
export async function getEvolutionInstanceStatus(
  config: ClinicEvolutionConfig,
): Promise<EvolutionStatusResult> {
  if (!config.evoUrl || !config.evoKey || !config.instanceName) {
    return { connected: false, status: "not_configured" };
  }

  try {
    const stateUrl = `${config.evoUrl}/instance/connectionState/${config.instanceName}`;
    const stateResp = await axios.get(stateUrl, {
      headers: { apikey: config.evoKey },
      timeout: 10000,
    });

    const d = stateResp.data;
    const state =
      d?.instance?.state ||
      d?.state ||
      d?.connectionStatus ||
      d?.status ||
      "unknown";

    const isConnected = state === "open" || state === "connected" || state === "CONNECTED";

    if (isConnected) {
      try {
        const listUrl = `${config.evoUrl}/instance/fetchInstances`;
        const listResp = await axios.get(listUrl, {
          headers: { apikey: config.evoKey },
          timeout: 10000,
        });
        const instances: any[] = Array.isArray(listResp.data) ? listResp.data : [];
        const found = instances.find(
          (i: any) =>
            (i.name || i.instanceName || i.instance?.instanceName || "").toLowerCase() ===
            config.instanceName.toLowerCase(),
        );
        const phone =
          found?.ownerJid?.split("@")[0] ||
          found?.instance?.ownerJid?.split("@")[0] ||
          found?.profileJid?.split("@")[0] ||
          found?.number ||
          undefined;
        return {
          connected: true,
          phone: phone?.replace(/\D/g, "") || undefined,
          profileName: found?.profileName || found?.instance?.profileName,
          status: state,
        };
      } catch (_) {
        return { connected: true, status: state };
      }
    }

    return { connected: false, status: state };
  } catch (error: any) {
    console.warn(`⚠️ [Evolution] Erro ao buscar connectionState de ${config.instanceName}:`, error.message);
    try {
      const url = `${config.evoUrl}/instance/fetchInstances`;
      const response = await axios.get(url, {
        headers: { apikey: config.evoKey },
        timeout: 10000,
      });
      const instances: any[] = Array.isArray(response.data) ? response.data : [];
      const found = instances.find(
        (i: any) =>
          (i.name || i.instanceName || i.instance?.instanceName || "").toLowerCase() ===
          config.instanceName.toLowerCase(),
      );
      if (!found) return { connected: false, status: "not_found" };
      const state =
        found.connectionStatus || found.instance?.state || found.state || found.status || "unknown";
      const isConnected = state === "open" || state === "connected" || state === "CONNECTED";
      const phone =
        found.ownerJid?.split("@")[0] ||
        found.instance?.ownerJid?.split("@")[0] ||
        found.profileJid?.split("@")[0] ||
        found.number ||
        undefined;
      return {
        connected: isConnected,
        phone: phone?.replace(/\D/g, "") || undefined,
        profileName: found.profileName || found.instance?.profileName,
        status: state,
      };
    } catch (e: any) {
      console.warn(`⚠️ [Evolution] Fallback fetchInstances também falhou:`, e.message);
      return { connected: false, status: "error" };
    }
  }
}

// ─── Per-clinic: generate QR code ─────────────────────────────────────────
export async function generateQRCodeForClinic(
  config: ClinicEvolutionConfig,
): Promise<EvolutionInstanceResult> {
  if (!config.evoUrl || !config.evoKey || !config.instanceName) {
    return { success: false, error: "Evolution API não configurada para esta clínica" };
  }

  const webhookUrl = getWebhookUrl();

  // Payload ajustado enviando syncFullHistory na raiz e no objeto config
  const createBody: Record<string, any> = {
    instanceName: config.instanceName,
    token: config.instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    syncFullHistory: false,
    readMessages: false,
    groupsIgnore: true,
    readStatus: false,
    alwaysOnline: false,
    config: {
      syncFullHistory: false,
      readMessages: false,
      groupsIgnore: true,
      readStatus: false,
      alwaysOnline: false,
    },
  };

  if (webhookUrl) {
    createBody.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    };
    console.log(`[Evolution] Webhook configurado: ${webhookUrl}`);
  }

  try {
    const createUrl = `${config.evoUrl}/instance/create`;
    console.log(`[Evolution] POST ${createUrl} — instance: ${config.instanceName}`);
    const createResp = await axios.post(createUrl, createBody, {
      headers: { apikey: config.evoKey, "Content-Type": "application/json" },
      timeout: 30000,
    });

    console.log(`[Evolution] /instance/create response:`, JSON.stringify(createResp.data).substring(0, 500));

    const state =
      createResp.data?.instance?.state ||
      createResp.data?.state ||
      createResp.data?.status ||
      "unknown";

    const qr =
      createResp.data?.qrcode?.base64 ||
      createResp.data?.base64 ||
      createResp.data?.qrcode ||
      createResp.data?.instance?.qrcode?.base64;

    if (qr && typeof qr === "string" && qr.length > 100) {
      console.log(`[Evolution] QR code obtido via /instance/create (tamanho: ${qr.length})`);
      return { success: true, qrCode: qr, status: state };
    }

    if (state === "open" || state === "connected") {
      console.log(`[Evolution] Instância já conectada (state: ${state})`);
      // Reforça o webhook mesmo em instância já conectada (migração de host, ex. Railway)
      await configureWebhookForInstance(config);
      return { success: true, status: "connected" };
    }

    console.log(`[Evolution] QR não encontrado no create (state: ${state}), tentando /instance/connect`);
    return await fetchQRFromConnect(config);
  } catch (err: any) {
    const status = err.response?.status;
    const msg =
      err.response?.data?.response?.message?.[0] ||
      err.response?.data?.message ||
      err.message ||
      "";

    console.log(`[Evolution] Erro no /instance/create — HTTP ${status}: ${msg}`);

    if (status === 403 || msg.toLowerCase().includes("already") || msg.toLowerCase().includes("in use")) {
      console.log(`[Evolution] Instância já existe, atualizando opções e tentando /instance/connect`);
      return await fetchQRFromConnect(config);
    }
    return { success: false, error: msg || "Erro ao comunicar com a Evolution API" };
  }
}

async function configureWebhookForInstance(config: ClinicEvolutionConfig): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;
  try {
    await axios.post(
      `${config.evoUrl}/webhook/set/${config.instanceName}`,
      {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        },
      },
      { headers: { apikey: config.evoKey, "Content-Type": "application/json" }, timeout: 10000 },
    );
    console.log(`[Evolution] Webhook configurado em instância existente: ${config.instanceName}`);
  } catch (e: any) {
    console.warn(`[Evolution] Aviso: falha ao configurar webhook — ${e.message}`);
  }
}

// Garante que instâncias já existentes atualizem as opções para não sincronizar histórico
async function updateInstanceOptions(config: ClinicEvolutionConfig): Promise<void> {
  try {
    await axios.post(
      `${config.evoUrl}/instance/setOptions/${config.instanceName}`,
      {
        syncFullHistory: false,
        readMessages: false,
        groupsIgnore: true,
        readStatus: false,
        alwaysOnline: false,
      },
      { headers: { apikey: config.evoKey, "Content-Type": "application/json" }, timeout: 10000 },
    );
    console.log(`[Evolution] Opções de instância atualizadas (syncFullHistory: false): ${config.instanceName}`);
  } catch (e: any) {
    console.warn(`[Evolution] Aviso: falha ao atualizar setOptions — ${e.message}`);
  }
}

async function fetchQRFromConnect(
  config: ClinicEvolutionConfig,
): Promise<EvolutionInstanceResult> {
  await configureWebhookForInstance(config);
  await updateInstanceOptions(config); // Aplica as opções na instância existente

  try {
    const connectUrl = `${config.evoUrl}/instance/connect/${config.instanceName}`;
    console.log(`[Evolution] GET ${connectUrl}`);
    const resp = await axios.get(connectUrl, {
      headers: { apikey: config.evoKey },
      timeout: 30000,
    });

    console.log(`[Evolution] /instance/connect response:`, JSON.stringify(resp.data).substring(0, 500));

    const qr =
      resp.data?.base64 ||
      resp.data?.qrcode?.base64 ||
      resp.data?.code ||
      resp.data?.pairingCode;
    const state = resp.data?.instance?.state || resp.data?.state || "unknown";

    if (qr && typeof qr === "string" && qr.length > 100) {
      console.log(`[Evolution] QR code obtido via /instance/connect (tamanho: ${qr.length})`);
      return { success: true, qrCode: qr, status: state };
    }

    if (state === "open" || state === "connected") {
      console.log(`[Evolution] Instância já conectada via /instance/connect`);
      return { success: true, status: "connected" };
    }

    return { success: false, error: `Não foi possível obter o QR code (state: ${state}). Verifique se a instância existe na Evolution API.`, status: state, rawResponse: resp.data };
  } catch (err: any) {
    console.log(`[Evolution] Erro em /instance/connect:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Legacy helpers ───────────────────────────────────────────────────────
export async function sendEvolutionMessage(
  phone: string,
  text: string,
): Promise<EvolutionSendResult> {
  return sendEvolutionMessageForClinic(globalConfig(), phone, text);
}

export async function createOrGetInstance(): Promise<EvolutionInstanceResult> {
  return generateQRCodeForClinic(globalConfig());
}

export function isEvolutionConfigured(): boolean {
  return !!(GLOBAL_EVO_URL && GLOBAL_EVO_KEY);
}

export function isClinicEvolutionConfigured(config: ClinicEvolutionConfig): boolean {
  return !!(config.evoUrl && config.evoKey && config.instanceName);
}

export function getEvolutionInstanceName(): string {
  return GLOBAL_EVO_INSTANCE;
}

export function getEvolutionUrl(): string {
  return GLOBAL_EVO_URL;
}

export { WEBHOOK_GLOBAL_URL };