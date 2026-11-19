import { z } from 'zod';

/** Returned by login and registration. */
export const accessTokenSchema = z
  .object({
    id: z.uuid().describe('ID of the logged-in user'),
    accessToken: z
      .string()
      .describe('JWT to send as "Authorization: Bearer <accessToken>"'),
  })
  .meta({ id: 'AccessToken' });
export type AccessToken = z.infer<typeof accessTokenSchema>;
