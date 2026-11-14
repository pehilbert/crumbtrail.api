import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),
  /** A number of seconds, or a duration string such as "15m", "1h" or "7d". */
  JWT_EXPIRES_IN: z
    .string()
    .regex(
      /^\d+(ms|s|m|h|d|w|y)?$/,
      'JWT_EXPIRES_IN must look like "3600", "15m", "1h" or "7d"',
    )
    .default('1h'),
  /** Set to "false" to turn off rate limiting (used by the e2e tests). */
  THROTTLE_ENABLED: booleanString,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
