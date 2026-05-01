import { z } from 'zod';

export const recurringRuleSchema = z.object({
  name: z.string().min(1, 'שם חובה').max(100),
  type: z.enum(['income', 'expense']),
  expectedAmount: z.coerce.number().positive('סכום חייב להיות חיובי'),
  amountTolerancePct: z.coerce.number().min(0).max(100).default(15),
  frequency: z.enum([
    'weekly',
    'monthly',
    'bimonthly',
    'quarterly',
    'semiannual',
    'yearly',
    'custom',
  ]),
  customIntervalDays: z.coerce.number().int().positive().nullable().optional(),
  matchPattern: z.string().max(200).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  remainingOccurrences: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
  categoryId: z.string().uuid().nullable().optional(),
});

export type RecurringRuleInput = z.infer<typeof recurringRuleSchema>;
