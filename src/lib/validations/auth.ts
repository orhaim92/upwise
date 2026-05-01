import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z
    .string()
    .min(12, 'הסיסמה חייבת להכיל לפחות 12 תווים')
    .max(128, 'הסיסמה ארוכה מדי'),
  name: z.string().min(1, 'שם הוא שדה חובה').max(100),
  // Phase 5: when signing up via an invite link, the form passes the raw
  // token. If it matches a pending invitation for the same email, we skip
  // creating a new household — the user joins via the accept flow instead.
  inviteToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(1, 'סיסמה היא שדה חובה'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
