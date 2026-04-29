export function normalizeDescription(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\d+\s*\/\s*\d+/g, '')
    .replace(/תשלום\s+\d+(\s*מתוך\s*\d+)?/g, '')
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '')
    .replace(/\d{1,2}-\d{1,2}-\d{2,4}/g, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseInstallment(
  raw: string,
): { number: number; total: number } | null {
  const slash = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (slash) {
    const number = parseInt(slash[1], 10);
    const total = parseInt(slash[2], 10);
    if (number >= 1 && total >= 2 && number <= total && total <= 36) {
      return { number, total };
    }
  }
  const hebrew = raw.match(/תשלום\s+(\d+)\s*מתוך\s*(\d+)/);
  if (hebrew) {
    const number = parseInt(hebrew[1], 10);
    const total = parseInt(hebrew[2], 10);
    if (number >= 1 && total >= 2 && number <= total && total <= 36) {
      return { number, total };
    }
  }
  return null;
}
