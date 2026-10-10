export const DEFAULT_BOOKING_MESSAGE =
  "Perfeito, {paciente}! Seu agendamento com {dentista} está realizado para o dia {data} às {hora}.\n\n" +
  "Um dia antes da consulta você receberá uma mensagem para confirmar sua presença.\n\n" +
  "O valor da consulta é R$150,00.";

export const BOOKING_MESSAGE_PLACEHOLDERS = ["{paciente}", "{dentista}", "{data}", "{hora}"] as const;

export function renderBookingMessage(
  template: string,
  values: { paciente: string; dentista: string; data: string; hora: string },
): string {
  return template
    .replace(/\{paciente\}/gi, values.paciente)
    .replace(/\{dentista\}/gi, values.dentista)
    .replace(/\{data\}/gi, values.data)
    .replace(/\{hora\}/gi, values.hora);
}
