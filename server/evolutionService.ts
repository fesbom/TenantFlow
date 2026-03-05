import axios from "axios";

function sanitizeUrl(url: string | undefined): string {
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

console.log("🔧 [Evolution] Configuração global:");
console.log(`   - EVO_URL: ${GLOBAL_EVO_URL || "(não configurada)"}`);
console.log(`   - EVO_KEY: ${GLOBAL_EVO_KEY ? `${GLOBAL_EVO_KEY.substring(0, 8)}...` : "(não configurada)"}`);
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
      found.connectionStatus ||
      found.instance?.state ||
      found.state ||
      found.status ||
      "unknown";

    const isConnected =
      state === "open" || state === "connected" || state === "CONNECTED";

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
  } catch (error: any) {
    console.warn(`⚠️ [Evolution] Erro ao buscar status de ${config.instanceName}:`, error.message);
    return { connected: false, status: "error" };
  }
}

// ─── Per-clinic: generate QR code ─────────────────────────────────────────
export async function generateQRCodeForClinic(
  config: ClinicEvolutionConfig,
): Promise<EvolutionInstanceResult> {
  if (!config.evoUrl || !config.evoKey || !config.instanceName) {
    return { success: false, error: "Evolution API não configurada para esta clínica" };
  }

  const createBody = {
    instanceName: config.instanceName,
    token: config.instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    config: {
      syncFullHistory: false,
      readMessages: false,
      groupsIgnore: true,
      readStatus: false,
      alwaysOnline: false,
    },
  };

  try {
    const createUrl = `${config.evoUrl}/instance/create`;
    const createResp = await axios.post(createUrl, createBody, {
      headers: { apikey: config.evoKey, "Content-Type": "application/json" },
      timeout: 30000,
    });

    const state =
      createResp.data?.instance?.state ||
      createResp.data?.state ||
      createResp.data?.status ||
      "unknown";

    const qr =
      createResp.data?.qrcode?.base64 ||
      createResp.data?.base64 ||
      createResp.data?.qrcode;

    if (qr && typeof qr === "string" && qr.length > 100)
      return { success: true, qrCode: qr, status: state };

    if (state === "open" || state === "connected")
      return { success: true, status: "connected" };

    // Fallback: hit /instance/connect
    return await fetchQRFromConnect(config);
  } catch (err: any) {
    const status = err.response?.status;
    const msg =
      err.response?.data?.response?.message?.[0] ||
      err.response?.data?.message ||
      err.message ||
      "";

    if (status === 403 || msg.toLowerCase().includes("already") || msg.toLowerCase().includes("in use")) {
      return await fetchQRFromConnect(config);
    }
    return { success: false, error: msg };
  }
}

async function fetchQRFromConnect(
  config: ClinicEvolutionConfig,
): Promise<EvolutionInstanceResult> {
  try {
    const connectUrl = `${config.evoUrl}/instance/connect/${config.instanceName}`;
    const resp = await axios.get(connectUrl, {
      headers: { apikey: config.evoKey },
      timeout: 30000,
    });

    const qr = resp.data?.base64 || resp.data?.qrcode?.base64;
    const state = resp.data?.instance?.state || resp.data?.state || "unknown";

    if (qr && typeof qr === "string" && qr.length > 100)
      return { success: true, qrCode: qr, status: state };

    if (state === "open" || state === "connected")
      return { success: true, status: "connected" };

    return { success: true, status: state, rawResponse: resp.data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Legacy helpers (backward compat — use per-clinic functions instead) ──
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
