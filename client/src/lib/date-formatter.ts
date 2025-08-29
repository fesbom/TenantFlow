/**
 * Função utilitária global para formatação segura de datas
 * Corrige o bug de fuso horário que causava exibição incorreta de datas (-1 dia)
 */

export function formatDateBR(dateString: string | Date | null | undefined): string {
  if (!dateString) return '';
  
  let dateToFormat: Date;
  
  if (typeof dateString === 'string') {
    // Adiciona T00:00:00 para garantir que seja tratado como data local
    // ao invés de UTC em alguns navegadores
    dateToFormat = new Date(dateString + 'T00:00:00');
  } else {
    dateToFormat = dateString;
  }
  
  // Usa o toLocaleDateString com o fuso horário UTC para forçar a extração do dia correto
  return dateToFormat.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    timeZone: 'UTC', // ESSENCIAL: Trata a data como se estivesse em UTC
  });
}

export function formatDateTimeBR(dateString: string | Date | null | undefined): string {
  if (!dateString) return '';
  
  let dateToFormat: Date;
  
  if (typeof dateString === 'string') {
    // Para datetime, não adiciona T00:00:00 pois já tem horário
    dateToFormat = new Date(dateString);
  } else {
    dateToFormat = dateString;
  }
  
  return dateToFormat.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShortBR(dateString: string | Date | null | undefined): string {
  if (!dateString) return '';
  
  let dateToFormat: Date;
  
  if (typeof dateString === 'string') {
    dateToFormat = new Date(dateString + 'T00:00:00');
  } else {
    dateToFormat = dateString;
  }
  
  return dateToFormat.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
}