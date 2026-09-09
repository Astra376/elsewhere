import { defineConfig } from 'vitest/config';
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.api.jsonc' },
      miniflare: {
        compatibilityDate: '2026-08-22',
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./drizzle'),
          AUTH_SECRET: 'test-only-secret-not-used-outside-isolated-runtime',
          APP_ORIGIN: 'http://localhost:3000',
          API_ORIGIN: 'http://localhost:8787',
        },
      },
    }),
  ],
  test: { include: ['tests/**/*.worker.spec.ts'], testTimeout: 20000 },
}));
