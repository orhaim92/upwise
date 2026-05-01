import { z } from 'zod';

export const updateCycleSchema = z.object({
  billingCycleStartDay: z.coerce.number().int().min(1).max(28),
});
