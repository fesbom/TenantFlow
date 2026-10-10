import { storage } from "./storage";
import type { ClinicBusinessHours } from "@shared/schema";

const CLINIC_TIME_ZONE = "America/Sao_Paulo";
const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getClinicNow(now: Date): { dateStr: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return { dateStr, weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function activePeriodsByDay(hours: ClinicBusinessHours[]): Map<number, ClinicBusinessHours[]> {
  const byDay = new Map<number, ClinicBusinessHours[]>();
  for (const h of hours) {
    if (!h.isActive || toMinutes(h.endTime) <= toMinutes(h.startTime)) continue;
    byDay.set(h.weekday, [...(byDay.get(h.weekday) ?? []), h]);
  }
  byDay.forEach((periods) => {
    periods.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  });
  return byDay;
}

function describeDay(periods: ClinicBusinessHours[]): string {
  return periods.map((p) => `${p.startTime} às ${p.endTime}`).join(" e ");
}

function formatSchedule(byDay: Map<number, ClinicBusinessHours[]>): string {
  const lines: string[] = [];
  let weekday = 0;
  while (weekday < 7) {
    const periods = byDay.get(weekday);
    if (!periods) {
      weekday++;
      continue;
    }
    const description = describeDay(periods);
    let end = weekday;
    while (end + 1 < 7 && byDay.has(end + 1) && describeDay(byDay.get(end + 1)!) === description) end++;
    const label =
      end === weekday
        ? WEEKDAY_NAMES[weekday]
        : `${WEEKDAY_SHORT[weekday]} a ${WEEKDAY_SHORT[end]}`;
    lines.push(`• ${label}: ${description}`);
    weekday = end + 1;
  }
  return lines.join("\n");
}

/**
 * Retorna o aviso a ser enviado ao paciente quando a IA transfere o atendimento para a equipe
 * fora do horário de atendimento da clínica. Retorna null quando a clínica está aberta ou
 * quando nenhum horário de atendimento foi configurado (sem restrição).
 */
export async function getOutOfHoursHandoffNotice(
  clinicId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const hours = await storage.getClinicBusinessHours(clinicId);
  const byDay = activePeriodsByDay(hours);
  if (byDay.size === 0) return null;

  const clinicNow = getClinicNow(now);
  const isHoliday = await storage.isHoliday(clinicId, clinicNow.dateStr);
  const isOpen =
    !isHoliday &&
    (byDay.get(clinicNow.weekday) ?? []).some(
      (p) => clinicNow.minutes >= toMinutes(p.startTime) && clinicNow.minutes < toMinutes(p.endTime),
    );
  if (isOpen) return null;

  return (
    `Já encaminhei sua solicitação para a nossa equipe. No momento a clínica está fora do horário de atendimento. Nosso atendimento humano funciona:\n` +
    `${formatSchedule(byDay)}\n` +
    `Assim que o atendimento iniciar, nossa equipe responderá você por aqui.`
  );
}

/** Fora do horário, o aviso substitui a mensagem de transferência para não enviar duas mensagens. */
export async function applyOutOfHoursNotice(clinicId: string, message: string): Promise<string> {
  try {
    const notice = await getOutOfHoursHandoffNotice(clinicId);
    return notice ?? message;
  } catch (error) {
    console.error("[HORARIO ATENDIMENTO] Falha ao montar aviso:", error);
    return message;
  }
}
