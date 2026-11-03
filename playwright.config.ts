import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the real stack the way production does: the API serves the built
 * web app from one origin, against a real Postgres, with the deterministic mock LLM
 * (no API key, no flakiness).
 */
const PORT = Number(process.env.E2E_PORT ?? 4100);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://slotpilot:slotpilot@localhost:5432/slotpilot_e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: [
      'npm run build -w @slotpilot/web',
      'npm run db:reset -w @slotpilot/api',
      'npx tsx --conditions=development apps/api/src/server.ts',
    ].join(' && '),
    url: `http://localhost:${PORT}/health/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      LOG_LEVEL: 'warn',
      DATABASE_URL,
      JWT_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef',
      AI_PROVIDER: 'mock',
      WEB_DIST_DIR: 'apps/web/dist',
      CLIENT_ORIGIN: `http://localhost:${PORT}`,
    },
  },
});
