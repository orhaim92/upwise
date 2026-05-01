import { z } from 'zod';

// Israeli mobile in E.164. Accepts:
//   +972501234567
//   +972 50 123 4567 (with spaces / dashes)
//   050-123-4567   → normalized to +972...
//   972501234567   → normalized to +972...
export const phoneSchema = z
  .string()
  .min(1, 'מספר טלפון חובה')
  .transform((s) => normalizePhone(s));

export function normalizePhone(input: string): string {
  let s = input.replace(/[\s\-()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = '+972' + s.slice(1);
    else if (s.startsWith('972')) s = '+' + s;
    else s = '+972' + s;
  }
  return s;
}

export function isValidIsraeliMobile(e164: string): boolean {
  // +972 5X XXX XXXX
  return /^\+9725\d{8}$/.test(e164);
}
