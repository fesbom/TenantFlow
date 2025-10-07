/**
 * Formata uma data para o padrão dd/mm/aaaa.
 * Lida com strings de data (ex: '2023-10-27') e timestamps completos (ex: '2023-10-27T10:00:00.000Z').
 * Usa UTC para evitar problemas de fuso horário.
 */
export function formatDateBR(dateInput: string | Date | null | undefined): string {
  // 1. Retorna um traço se a data de entrada for nula, indefinida ou vazia.
  if (!dateInput) {
    return "-";
  }

  const date = new Date(dateInput);

  // 2. Verifica se a data criada a partir do input é válida.
  if (isNaN(date.getTime())) {
    return "Data Inválida";
  }

  // 3. Formata a data, usando UTC para evitar que o fuso horário mude o dia.
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC', // Essencial para consistência
  });
}

/**
 * Formata uma data e hora para o padrão dd/mm/aaaa hh:mm.
 * Lida com timestamps completos. O fuso horário será o do navegador do usuário.
 */
export function formatDateTimeBR(dateInput: string | Date | null | undefined): string {
  if (!dateInput) {
    return "-";
  }

  const date = new Date(dateInput);

  if (isNaN(date.getTime())) {
    return "Data Inválida";
  }

  // Para data e hora, geralmente queremos o horário local do usuário, então não usamos UTC.
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formata uma data para o padrão curto dd/mm.
 * Usa UTC para evitar problemas de fuso horário.
 */
export function formatDateShortBR(dateInput: string | Date | null | undefined): string {
  if (!dateInput) {
    return "-";
  }

  const date = new Date(dateInput);

  if (isNaN(date.getTime())) {
    return "Data Inválida";
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
}