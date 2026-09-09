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
          STRIPE_SECRET_KEY: 'sk_test_isolated_checkout_fixture',
          STRIPE_BASIC_MONTHLY: 'price_basic',
          STRIPE_PLUS_MONTHLY: 'price_plus',
          OPENROUTER_API_KEY: 'test-only-no-provider-requests',
          REALTIME_API_TOKEN: 'test-only-realtime-token',
          REALTIME_APP_ID: 'test-only-realtime-app',
        },
      },
    }),
  ],
  test: { include: ['tests/**/*.worker.spec.ts'], testTimeout: 20000 },
}));
