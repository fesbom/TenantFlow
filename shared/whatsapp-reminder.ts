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

  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 14) digits = digits.slice(3);
  if (digits.startsWith("0") && digits.length === 12) digits = digits.slice(1);
  const nationalNumber = digits.length === 11 ? digits : null;
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

export interface ReceivableReminderBillInput {
  id: string;
  value: string | number;
  dueDate: string;
  description: string;
  installmentNumber: number;
  totalInstallments: number;
  status: string;
}

export function formatReceivableDateBR(value: string): string {
  const date = parseDateOnly(value);
  return date
    ? `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}/${date.year}`
    : value;
}

export function getBrazilianDaysLate(value: string): number {
  const date = parseDateOnly(value);
  if (!date) return 0;
  const dueDay = Date.UTC(date.year, date.month - 1, date.day);
  return Math.max(0, Math.floor((getBrazilianTodayUtcDay() - dueDay) / 86_400_000));
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function buildReceivableBatchReminderMessage(
  clinicName: string,
  patientName: string,
  bills: ReceivableReminderBillInput[],
  paymentInstructions?: string | null,
): string {
  const totalCents = bills.reduce((sum, bill) => sum + Math.round(Number(bill.value) * 100), 0);
  const clinicIdentifier = clinicName.trim() || "nossa clínica";
  const paymentInfo = paymentInstructions?.trim()
    || "Para obter a chave PIX ou instruções de pagamento, responda a esta mensagem.";

  if (bills.length === 1) {
    const bill = bills[0];
    const value = formatCurrency(Number(bill.value));
    const dueDate = formatReceivableDateBR(bill.dueDate);
    const daysLate = getBrazilianDaysLate(bill.dueDate);
    const installment = `${bill.installmentNumber}/${bill.totalInstallments}`;
    return [
      `Olá, ${patientName}. Aqui é da ${clinicIdentifier}.`,
      `Consta em nosso sistema uma parcela vencida no valor de ${value}, com vencimento em ${dueDate} (parcela ${installment}).`,
      daysLate > 0 ? `Esta parcela está com ${daysLate} dia(s) de atraso.` : "",
      paymentInfo,
      "Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem. Para dúvidas ou envio do comprovante, estamos à disposição.",
    ].filter(Boolean).join("\n\n");
  }

  const items = bills.map((bill) => {
    const daysLate = getBrazilianDaysLate(bill.dueDate);
    const installment = `${bill.installmentNumber}/${bill.totalInstallments}`;
    const description = bill.description.trim() ? ` - ${bill.description.trim()}` : "";
    const delay = daysLate > 0 ? ` (${daysLate} dia(s) de atraso)` : "";
    return `• Vencimento: ${formatReceivableDateBR(bill.dueDate)} - ${formatCurrency(Number(bill.value))}${delay} - parcela ${installment}${description}`;
  });

  return [
    `Olá, ${patientName}. Aqui é da ${clinicIdentifier}.`,
    "Identificamos as seguintes parcelas vencidas em nosso sistema:",
    ...items,
    `Valor total vencido: ${formatCurrency(totalCents / 100)}.`,
    paymentInfo,
    "Caso já tenha efetuado algum pagamento, por favor desconsidere o respectivo título. Para dúvidas ou envio do comprovante, estamos à disposição.",
  ].join("\n\n");
}