import { z } from 'zod';

export const userIdSchema = z.uuid({ error: 'id must be a valid GUID' });

const username = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_.]+$/, {
    error: 'username may only contain letters, digits, "_" and "."',
  });

const password = z.string().min(8).max(128);
const email = z.string().trim().toLowerCase().pipe(z.email());
const name = z.string().trim().min(1).max(50);
const pronouns = z.string().trim().min(1).max(30).nullable();

export const createUserSchema = z.strictObject({
  username,
  password,
  email,
  firstName: name,
  lastName: name,
  pronouns: pronouns.optional().default(null),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .strictObject({
    username,
    firstName: name,
    lastName: name,
    pronouns,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    error: 'At least one field must be provided',
  });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
