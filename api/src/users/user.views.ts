import type { User } from './user.schema.js';

/** What anyone may see about a user. */
export interface PublicProfile {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  pronouns: string | null;
  joinDate: Date;
}

/** What a user may see about themselves. */
export interface PrivateProfile extends PublicProfile {
  email: string;
}

export function toPublicProfile(user: User): PublicProfile {
  return {
    id: user._id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    pronouns: user.pronouns ?? null,
    joinDate: user.joinDate,
  };
}

export function toPrivateProfile(user: User): PrivateProfile {
  return { ...toPublicProfile(user), email: user.email };
}
