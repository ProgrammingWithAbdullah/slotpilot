import { createServer } from 'node:http';
import { loadEnv } from './config/env.js';
import { createPool } from './db/pool.js';
import { createLogger } from './lib/logger.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';
import { attachRealtime } from './modules/realtime/socket.js';

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const pool = createPool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX, ssl: env.DATABASE_SSL });

const container = await createContainer(env, pool, logger);
const app = createApp(container);
const httpServer = createServer(app);
const realtime = attachRealtime({
  httpServer,
  events: container.events,
  tokens: container.tokens,
  logger,
  corsOrigin: env.isProduction ? undefined : env.CLIENT_ORIGIN,
});

httpServer.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, ai: container.aiProviderName, business: container.business.slug },
    'SlotPilot API listening',
  );
  if (!env.aiEnabled) logger.warn('No GEMINI_API_KEY set: the chat assistant will hand users to the booking form');
});

// Graceful shutdown: stop accepting, let in-flight AI turns finish, close the pool.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  await realtime.close();
  httpServer.close();
  await container.tasks.idle();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
