import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 };

/** "3600" (seconds), "15m", "12h", "30d" or "2w", read as a number of seconds. */
const durationSeconds = (name: string) =>
  z
    .string()
    .regex(/^\d+[smhdw]?$/, `${name} must look like "3600", "12h" or "30d"`)
    .transform((value) => {
      const unit = value.at(-1) as keyof typeof DURATION_UNITS;
      return unit in DURATION_UNITS
        ? Number(value.slice(0, -1)) * DURATION_UNITS[unit]
        : Number(value);
    })
    .pipe(z.int().positive(`${name} must be more than 0`));

/** Comma-separated origins such as "http://localhost:4200,https://app.example.com". */
const originList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z.url().refine((origin) => new URL(origin).origin === origin, {
        error:
          'CORS_ORIGINS entries must be origins like "https://app.example.com" (no path or trailing slash)',
      }),
    ),
  );

export const envSchema = z
  .object({
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
      .default('15m'),
    /** How long a refresh token (and so an idle session) lasts. Each refresh starts it again. */
    REFRESH_TOKEN_EXPIRES_IN: durationSeconds(
      'REFRESH_TOKEN_EXPIRES_IN',
    ).default(30 * 86_400),
    /** Set to "false" only for plain-HTTP development where the browser rejects Secure cookies. */
    REFRESH_COOKIE_SECURE: booleanString,
    /** "none" is needed when the frontend and API are on different sites; it requires Secure. */
    REFRESH_COOKIE_SAME_SITE: z
      .enum(['strict', 'lax', 'none'])
      .default('strict'),
    /** Browser origins allowed to call the API (CORS with credentials, and CSRF trusted origins). */
    CORS_ORIGINS: originList,
    /** Serves Swagger UI at /api/docs and the OpenAPI JSON at /api/docs-json. Turn off in production. */
    SWAGGER_ENABLED: booleanString,
  })
  .refine(
    (env) =>
      env.REFRESH_COOKIE_SECURE || env.REFRESH_COOKIE_SAME_SITE !== 'none',
    {
      error:
        'REFRESH_COOKIE_SAME_SITE=none requires REFRESH_COOKIE_SECURE=true',
      path: ['REFRESH_COOKIE_SAME_SITE'],
    },
  );

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
