const ILS_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatILS(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return ILS_FORMATTER.format(n);
}

export function formatDate(date: string | Date): string {
  return DATE_FORMATTER.format(typeof date === 'string' ? new Date(date) : date);
}

export function formatDateTime(date: string | Date): string {
  return DATETIME_FORMATTER.format(
    typeof date === 'string' ? new Date(date) : date,
  );
}

export function template(
  str: string,
  params: Record<string, string | number>,
): string {
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    String(params[k] ?? `{${k}}`),
  );
}
