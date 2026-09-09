import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['lib/domain.ts', 'server/media.ts', 'server/push.ts'],
    },
  },
});
