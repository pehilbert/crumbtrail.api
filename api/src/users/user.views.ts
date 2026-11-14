import { z } from 'zod';
import type { User } from './user.schema.js';

/** What anyone may see about a user. */
export const publicProfileSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    pronouns: z.string().nullable(),
    joinDate: z.iso.datetime(),
  })
  .meta({ id: 'PublicProfile' });
export type PublicProfile = z.infer<typeof publicProfileSchema>;

/** What a user may see about themselves. */
export const privateProfileSchema = publicProfileSchema
  .extend({ email: z.email() })
  .meta({ id: 'PrivateProfile' });
export type PrivateProfile = z.infer<typeof privateProfileSchema>;

/** Response to DELETE /users/{id}. */
export const deactivatedUserSchema = z
  .object({ id: z.uuid(), active: z.literal(false) })
  .meta({ id: 'DeactivatedUser' });
export type DeactivatedUser = z.infer<typeof deactivatedUserSchema>;

export function toPublicProfile(user: User): PublicProfile {
  return {
    id: user._id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    pronouns: user.pronouns ?? null,
    joinDate: user.joinDate.toISOString(),
  };
}

export function toPrivateProfile(user: User): PrivateProfile {
  return { ...toPublicProfile(user), email: user.email };
}
