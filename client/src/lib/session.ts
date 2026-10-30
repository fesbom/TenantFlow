// Encerramento centralizado de sessão: qualquer 401/403 de autenticação (token expirado,
// revogado, usuário inativo ou clínica suspensa) limpa as credenciais e volta para o login,
// em qualquer parte do sistema. Sem isso, telas com polling ficam em loop de falhas.

const AUTH_ERROR_CODES = new Set([
  "TOKEN_OBRIGATORIO",
  "TOKEN_INVALIDO",
  "TOKEN_REVOGADO",
  "USUARIO_INVALIDO",
  "USUARIO_INATIVO",
  "CLINICA_AUSENTE",
  "CLINICA_INVALIDA",
  "CLINICA_SUSPENSA",
]);

let handlingSessionExpired = false;

/** Extrai o código de erro retornado pela API (ex.: { code: "TOKEN_INVALIDO" }). */
export async function readApiErrorCode(response: Response): Promise<string | undefined> {
  try {
    const cloned = response.clone();
    const body = await cloned.json();
    return typeof body?.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
}

/** Limpa credenciais e recarrega a aplicação, caindo na tela de login. */
export function forceLogoutToLogin(): void {
  if (handlingSessionExpired) return;
  handlingSessionExpired = true;
  localStorage.removeItem("dental_token");
  localStorage.removeItem("dental_user");
  window.location.replace("/");
}

/**
 * Se a resposta for 401/403 com código de erro de autenticação, encerra a sessão.
 * Só reage quando HAVIA um token salvo: requisições públicas sem credencial (ex.: a
 * tela de login buscando o branding) também recebem 401 e não devem derrubar a sessão.
 * Retorna true quando a sessão foi encerrada (o chamador não deve prosseguir).
 */
export async function handleAuthFailure(response: Response): Promise<boolean> {
  if (response.status !== 401 && response.status !== 403) return false;
  if (!localStorage.getItem("dental_token")) return false;
  const code = await readApiErrorCode(response);
  if (code && AUTH_ERROR_CODES.has(code)) {
    forceLogoutToLogin();
    return true;
  }
  return false;
}

/** Variante para erros já convertidos em Error com o formato "<status>: <body>". */
export function handleAuthFailureFromError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (!localStorage.getItem("dental_token")) return false;
  const match = error.message.match(/^(401|403):/);
  if (!match) return false;
  const hasAuthCode = Array.from(AUTH_ERROR_CODES).some((code) => error.message.includes(code));
  if (hasAuthCode) {
    forceLogoutToLogin();
    return true;
  }
  return false;
}
