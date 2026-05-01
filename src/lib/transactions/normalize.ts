// Hebrew month abbreviations + full names that often appear in bank descriptions.
const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'מרס',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
  'ינו',
  'פבר',
  'אפר',
  'יונ',
  'יול',
  'אוג',
  'ספט',
  'אוק',
  'נוב',
  'דצמ',
];
const HEBREW_MONTH_RE = new RegExp(`\\b(${HEBREW_MONTHS.join('|')})\\b`, 'g');

export function normalizeDescription(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\d+\s*\/\s*\d+/g, '')
    .replace(/תשלום\s+\d+(\s*מתוך\s*\d+)?/g, '')
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '')
    .replace(/\d{1,2}-\d{1,2}-\d{2,4}/g, '')
    .replace(/\b\d{1,2}\/\d{2,4}\b/g, '')
    .replace(/\b\d{1,2}-\d{2,4}\b/g, '')
    .replace(HEBREW_MONTH_RE, '')
    .replace(/\b\d{3,}\b/g, '')
    .replace(/[-–—]+/g, ' ')
    .replace(/[()]/g, ' ')
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
