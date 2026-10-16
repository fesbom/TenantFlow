// Normaliza um telefone brasileiro para WhatsApp (55 + DDD + 9 + 8 dígitos) ou retorna null.
// Aceita: zero de operadora na frente (04899321247), prefixo 55, e o formato antigo de celular
// com 8 dígitos iniciados em 6-9 (o nono dígito é acrescentado). Fixos (iniciados em 2-5) são rejeitados.
export function normalizeWhatsappPhone(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  if (!/^[1-9][1-9]\d{8,9}$/.test(digits)) return null;
  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (subscriber.length === 9) return subscriber.startsWith("9") ? `55${ddd}${subscriber}` : null;
  return /^[6-9]/.test(subscriber) ? `55${ddd}9${subscriber}` : null;
}

export function isValidWhatsappPhone(phone: string | null | undefined): boolean {
  return normalizeWhatsappPhone(phone) !== null;
}
