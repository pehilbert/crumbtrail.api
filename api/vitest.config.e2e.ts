import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 300_000,
    env: {
      OBSERVE_ENABLED: 'false',
      THROTTLE_ENABLED: 'false',
      JWT_SECRET: 'e2e-test-secret-that-is-at-least-32-chars',
      JWT_EXPIRES_IN: '1h',
    },
  },
});
