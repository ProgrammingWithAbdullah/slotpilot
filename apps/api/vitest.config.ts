import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
