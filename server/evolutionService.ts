import axios from "axios";
import { randomUUID } from "crypto";

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
  if (isDev) {
    return devDomain ? `https://${devDomain}/webhook/evolution` : "";
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
  // Preenchido por quem resolve a config: quando true, o envio é totalmente simulado
  // (nenhuma chamada HTTP à Evolution API) e a mensagem é apenas persistida pelo chamador.
  simulated?: boolean;
  clinicId?: string;
}

export function buildClinicConfig(clinic: {
  id?: string;
  evolutionInstanceName?: string | null;
  evolutionApiKey?: string | null;
  simulationMode?: boolean | null;
}): ClinicEvolutionConfig {
  return {
    evoUrl: GLOBAL_EVO_URL,
    evoKey: (clinic.evolutionApiKey || GLOBAL_EVO_KEY).trim(),
    instanceName: (clinic.evolutionInstanceName || GLOBAL_EVO_INSTANCE).trim(),
    clinicId: clinic.id,
    simulated: !!clinic.simulationMode,
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
  status?: string;
  error?: string;
  simulated?: boolean;
}

function simulatedSendResult(config: ClinicEvolutionConfig, phone: string, kind: string): EvolutionSendResult {
  console.log(`🧪 [Simulação] ${kind} para ${phone} NÃO enviado à Evolution API (clínica ${config.clinicId ?? "?"}).`);
  return { success: true, simulated: true, status: "simulated", messageId: `sim-out-${randomUUID()}` };
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

export interface EvolutionReplyButton {
  id: string;
  displayText: string;
}

function normalizePhoneForEvolution(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return digits;
}

function getEvolutionSendError(error: any): string {
  const status = error.response?.status;
  const data = error.response?.data;
  const responseMessage = data?.response?.message ?? data?.message ?? data?.error;
  const details = Array.isArray(responseMessage)
    ? responseMessage.filter((item) => typeof item === "string").join("; ")
    : typeof responseMessage === "string"
      ? responseMessage
      : "";
  return details ? `HTTP ${status}: ${details}` : error.message;
}

// ─── Per-clinic: send message ──────────────────────────────────────────────
export async function sendEvolutionMessageForClinic(
  config: ClinicEvolutionConfig,
  phone: string,
  text: string,
): Promise<EvolutionSendResult> {
  if (config.simulated) return simulatedSendResult(config, phone, "Mensagem");
  if (!config.evoUrl || !config.evoKey || !config.instanceName) {
    return { success: false, error: "Evolution API não configurada para esta clínica" };
  }
  try {
    const normalizedPhone = normalizePhoneForEvolution(phone);
    if (normalizedPhone.length < 12 || normalizedPhone.length > 15) {
      return { success: false, error: "Telefone inválido. Informe DDD e número com código do país quando aplicável." };
    }
    const sendUrl = `${config.evoUrl}/message/sendText/${config.instanceName}`;
    const response = await axios.post(
      sendUrl,
      { number: normalizedPhone, text, delay: 1200, linkPreview: true },
      {
        headers: { apikey: config.evoKey, "Content-Type": "application/json" },
        timeout: 30000,
      },
    );
    return {
      success: true,
      messageId: response.data?.key?.id,
      status: String(response.data?.status ?? response.data?.messageStatus ?? response.status),
    };
  } catch (error: any) {
    const detail = getEvolutionSendError(error);
    console.error(`❌ [Evolution] Erro ao enviar para ${config.instanceName}:`, detail);
    return { success: false, error: detail };
  }
}

export async function sendEvolutionButtonsForClinic(
  config: ClinicEvolutionConfig,
  phone: string,
  content: { title: string; description: string; footer?: string; buttons: EvolutionReplyButton[] },
): Promise<EvolutionSendResult> {
  if (config.simulated) return simulatedSendResult(config, phone, "Botões");
  // Botões interativos não são entregues em números comuns (Baileys); usa texto numerado,
  // que o webhook já interpreta ("1" confirma, "2" desmarca).
  const options = content.buttons
    .map((button, index) => `*${index + 1}* - ${button.displayText}`)
    .join("\n");
  const text = [
    `*${content.title}*`,
    content.description,
    `Responda com:\n${options}`,
    content.footer ? `_${content.footer}_` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return sendEvolutionMessageForClinic(config, phone, text);
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
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
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

async function configureWebhookForInstance(config: ClinicEvolutionConfig): Promise<boolean> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return false;
  try {
    await axios.post(
      `${config.evoUrl}/webhook/set/${config.instanceName}`,
      {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        },
      },
      { headers: { apikey: config.evoKey, "Content-Type": "application/json" }, timeout: 10000 },
    );
    console.log(`[Evolution] Webhook configurado em instância existente: ${config.instanceName}`);
    return true;
  } catch (e: any) {
    console.warn(`[Evolution] Aviso: falha ao configurar webhook — ${e.message}`);
    return false;
  }
}

export async function ensureEvolutionWebhookForClinic(config: ClinicEvolutionConfig): Promise<boolean> {
  return configureWebhookForInstance(config);
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
  if (config.simulated) return !!config.instanceName;
  return !!(config.evoUrl && config.evoKey && config.instanceName);
}

export function getEvolutionInstanceName(): string {
  return GLOBAL_EVO_INSTANCE;
}

export function getEvolutionUrl(): string {
  return GLOBAL_EVO_URL;
}

export { WEBHOOK_GLOBAL_URL };