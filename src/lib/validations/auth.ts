import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z
    .string()
    .min(12, 'הסיסמה חייבת להכיל לפחות 12 תווים')
    .max(128, 'הסיסמה ארוכה מדי'),
  name: z.string().min(1, 'שם הוא שדה חובה').max(100),
});

export const loginSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(1, 'סיסמה היא שדה חובה'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
