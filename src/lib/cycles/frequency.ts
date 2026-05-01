import { addDays, addMonths, addYears, isAfter, isBefore } from 'date-fns';
import type { recurringRules } from '@/lib/db/schema';

type RuleFrequency = (typeof recurringRules.$inferSelect)['frequency'];

export function hasOccurrenceInWindow(
  rule: {
    frequency: RuleFrequency;
    customIntervalDays: number | null;
    startDate: string | null;
    endDate: string | null;
    remainingOccurrences: number | null;
  },
  from: Date,
  to: Date,
): boolean {
  if (rule.endDate && isBefore(new Date(rule.endDate), from)) return false;
  if (rule.remainingOccurrences !== null && rule.remainingOccurrences <= 0)
    return false;

  return enumerateOccurrences(rule, from, to).length > 0;
}

export function enumerateOccurrences(
  rule: {
    frequency: RuleFrequency;
    customIntervalDays: number | null;
    startDate: string | null;
    endDate: string | null;
  },
  from: Date,
  to: Date,
): Date[] {
  const anchor = rule.startDate ? new Date(rule.startDate) : from;
  const endLimit = rule.endDate
    ? isBefore(new Date(rule.endDate), to)
      ? new Date(rule.endDate)
      : to
    : to;

  const out: Date[] = [];
  let cursor = anchor;

  while (isBefore(cursor, from)) {
    cursor = step(cursor, rule.frequency, rule.customIntervalDays);
    if (isAfter(cursor, endLimit)) return out;
  }

  while (!isAfter(cursor, endLimit)) {
    out.push(cursor);
    cursor = step(cursor, rule.frequency, rule.customIntervalDays);
  }

  return out;
}

function step(
  date: Date,
  freq: RuleFrequency,
  customDays: number | null,
): Date {
  switch (freq) {
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonths(date, 1);
    case 'bimonthly':
      return addMonths(date, 2);
    case 'quarterly':
      return addMonths(date, 3);
    case 'semiannual':
      return addMonths(date, 6);
    case 'yearly':
      return addYears(date, 1);
    case 'custom':
      return addDays(date, customDays ?? 30);
  }
}
