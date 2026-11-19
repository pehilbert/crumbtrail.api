/** Stricter limit for credential endpoints (login, registration): 10 per minute per IP. */
export const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
