import { z } from 'zod';

export const savingsGoalSchema = z.object({
  name: z.string().min(1, 'שם חובה').max(100),
  targetAmount: z.coerce.number().positive('סכום יעד חייב להיות חיובי'),
  currentAmount: z.coerce.number().min(0).default(0),
  targetDate: z.string().nullable().optional(),
  monthlyContribution: z.coerce.number().min(0).nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

export type SavingsGoalInput = z.infer<typeof savingsGoalSchema>;
