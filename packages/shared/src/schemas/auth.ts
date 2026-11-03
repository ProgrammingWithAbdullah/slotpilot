import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

// bcrypt only uses the first 72 bytes, so we reject longer passwords instead of silently truncating.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => new TextEncoder().encode(p).length <= 72, 'Password must be at most 72 bytes');

export const signupInputSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: 'customer' | 'admin';
  createdAt: string;
}
