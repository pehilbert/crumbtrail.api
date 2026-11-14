import { z } from 'zod';

export const loginSchema = z
  .strictObject({
    /** Username or email; an "@" means email. */
    login: z.string().trim().min(1).max(254),
    // Capped so huge inputs cannot be used to make hashing expensive.
    password: z.string().min(1).max(128),
  })
  .meta({ id: 'LoginRequest' });
export type LoginDto = z.infer<typeof loginSchema>;
