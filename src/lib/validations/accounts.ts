import { z } from 'zod';

export const addAccountSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1, 'שם תצוגה חובה').max(100),
  credentials: z.record(z.string(), z.string()),
});

export const updateAccountSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(100),
  isActive: z.boolean().optional(),
});

export const deleteAccountSchema = z.object({
  id: z.string().uuid(),
});

export type AddAccountInput = z.infer<typeof addAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
