const BRAZILIAN_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export function normalizeBrazilianWhatsAppPhone(phone: unknown): string | null {
  if (typeof phone !== "string") return null;

  const digits = phone.replace(/\D/g, "");
  const nationalNumber = digits.length === 13 && digits.startsWith("55")
    ? digits.slice(2)
    : digits.length === 11
      ? digits
      : null;
  if (!nationalNumber) return null;

  const areaCode = nationalNumber.slice(0, 2);
  const subscriberNumber = nationalNumber.slice(2);
  if (!BRAZILIAN_DDDS.has(areaCode) || !/^9\d{8}$/.test(subscriberNumber)) return null;

  return `55${nationalNumber}`;
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day };
}

function getBrazilianTodayUtcDay(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

export interface ReceivableReminderMessageInput {
  patientName: string;
  value: string | number;
  dueDate: string;
  description: string;
  installmentNumber: number;
  totalInstallments: number;
}

export function buildReceivableReminderMessage(input: ReceivableReminderMessageInput): string {
  const value = Number(input.value);
  const formattedValue = value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dueDate = parseDateOnly(input.dueDate);
  const formattedDueDate = dueDate
    ? `${String(dueDate.day).padStart(2, "0")}/${String(dueDate.month).padStart(2, "0")}/${dueDate.year}`
    : input.dueDate;
  const dueDay = dueDate ? Date.UTC(dueDate.year, dueDate.month - 1, dueDate.day) : null;
  const daysLate = dueDay === null ? 0 : Math.max(0, Math.floor((getBrazilianTodayUtcDay() - dueDay) / 86_400_000));
  const installment = `${input.installmentNumber}/${input.totalInstallments}`;
  const reference = input.description.trim()
    ? `${input.description.trim()} - parcela ${installment}`
    : `parcela ${installment}`;

  return [
    `Olá, ${input.patientName}. Tudo bem?`,
    `Consta em nosso sistema uma pendência no valor de ${formattedValue}, com vencimento em ${formattedDueDate}.`,
    daysLate > 0 ? `Este título está com ${daysLate} dia(s) de atraso.` : "",
    `Identificação: ${reference}.`,
    "Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem. Para maiores dúvidas ou envio do comprovante, estamos à disposição.",
  ].filter(Boolean).join("\n\n");
}

export function buildWhatsAppReminderUrl(phone: string, message: string): string {
  const normalizedPhone = normalizeBrazilianWhatsAppPhone(phone);
  if (!normalizedPhone) throw new Error("O telefone não é um celular brasileiro válido para WhatsApp.");

  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(message)}`;
}