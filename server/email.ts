import { ReplitConnectors } from "@replit/connectors-sdk";
import crypto from "crypto";
import type { Request, Response } from "express";

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "[invalid-email]";
  return `${localPart.slice(0, 2)}***@${domain}`;
}

async function readBrevoResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const emailData = {
    sender: {
      email: params.from,
      name: process.env.BREVO_FROM_NAME || "DentiCare",
    },
    to: [{ email: params.to }],
    subject: params.subject,
    ...(params.text ? { textContent: params.text } : {}),
    ...(params.html ? { htmlContent: params.html } : {}),
  };

  try {
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy("brevo", "/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailData),
    });
    const responseBody = await readBrevoResponse(response);

    if (!response.ok) {
      console.error("[email] Brevo rejected message", {
        recipient: maskEmail(params.to),
        statusCode: response.status,
        code: typeof responseBody.code === "string" ? responseBody.code : undefined,
      });
      return false;
    }

    console.log("[email] Brevo accepted message", {
      recipient: maskEmail(params.to),
      subject: params.subject,
      messageId: typeof responseBody.messageId === "string"
        ? responseBody.messageId
        : undefined,
    });
    return true;
  } catch (error) {
    // Never log emailData here: password reset messages contain the secret token.
    console.error("[email] Brevo request failed", {
      recipient: maskEmail(params.to),
      errorType: error instanceof Error ? error.name : "UnknownConnectorError",
    });
    return false;
  }
}

export function handleBrevoEmailWebhook(req: Request, res: Response) {
  const configuredSecret = process.env.BREVO_WEBHOOK_SECRET || "";
  const providedSecret = req.get("x-denticare-webhook-secret") || "";
  const configuredBuffer = Buffer.from(configuredSecret);
  const providedBuffer = Buffer.from(providedSecret);

  if (
    !configuredSecret ||
    configuredBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(configuredBuffer, providedBuffer)
  ) {
    return res.status(401).json({ message: "Unauthorized webhook" });
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const payload of events) {
    const recipient = typeof payload?.email === "string"
      ? maskEmail(payload.email)
      : "[unknown]";

    console.log("[email-webhook] Brevo delivery event", {
      event: typeof payload?.event === "string" ? payload.event : "unknown",
      messageId: typeof payload?.["message-id"] === "string"
        ? payload["message-id"]
        : undefined,
      recipient,
    });
  }

  return res.status(204).send();
}

export function generatePasswordResetEmail(userEmail: string, resetToken: string, baseUrl?: string) {
  const configuredBaseUrl = (baseUrl || process.env.PASSWORD_RESET_BASE_URL || "").trim();
  if (!configuredBaseUrl) {
    throw new Error("PASSWORD_RESET_BASE_URL must be configured for password reset emails");
  }

  let publicBaseUrl: URL;
  try {
    publicBaseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("PASSWORD_RESET_BASE_URL must be a valid URL");
  }

  if (publicBaseUrl.protocol !== "https:") {
    throw new Error("PASSWORD_RESET_BASE_URL must use HTTPS");
  }

  const basePath = publicBaseUrl.pathname.replace(/\/+$/, "");
  publicBaseUrl.search = "";
  publicBaseUrl.hash = "";
  publicBaseUrl.pathname = `${basePath}/reset-password`;
  publicBaseUrl.searchParams.set("token", resetToken);
  const resetUrl = publicBaseUrl.toString();
  
  return {
    to: userEmail,
    from: process.env.BREVO_FROM_EMAIL || 'fesbom@gmail.com',
    subject: 'DentiCare - Redefinição de Senha',
    text: `
Olá!

Você solicitou a redefinição de sua senha no DentiCare.

Para redefinir sua senha, clique no link abaixo:
${resetUrl}

Este link é válido por 24 horas.

Se você não solicitou esta redefinição, ignore este email.

Atenciosamente,
Equipe DentiCare
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DentiCare</h1>
    </div>
    <div class="content">
      <h2>Redefinição de Senha</h2>
      <p>Olá!</p>
      <p>Você solicitou a redefinição de sua senha no sistema DentiCare.</p>
      <p>Para redefinir sua senha, clique no botão abaixo:</p>
      <a href="${resetUrl}" class="button">Redefinir Senha</a>
      <p>Ou copie e cole este link no seu navegador:</p>
      <p style="word-break: break-all; background-color: #fff; padding: 10px; border-radius: 3px;">${resetUrl}</p>
      <p><strong>Este link é válido por 24 horas.</strong></p>
      <p>Se você não solicitou esta redefinição, ignore este email com segurança.</p>
    </div>
    <div class="footer">
      <p>Atenciosamente,<br>Equipe DentiCare</p>
    </div>
  </div>
</body>
</html>
    `
  };
}