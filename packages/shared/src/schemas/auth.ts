import { z } from 'zod';
import { emailSchema } from './common.js';

/** Password rule from the plan: 8 to 72 characters, bcrypt cost 12. */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(200),
  email: emailSchema,
  password: passwordSchema,
  /** Optional: registration creates a business named after the owner if absent. */
  businessName: z.string().trim().min(1).max(200).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password').max(72),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** Brand asset upload: a PNG or JPEG data URL, size checked by the server. */
export const imageUploadSchema = z.object({
  dataUrl: z.string().min(1, 'Provide an image').max(2_000_000),
});

export type ImageUploadInput = z.infer<typeof imageUploadSchema>;
