const fs = require('fs');
const fastify = require('fastify');
const { loadConfig } = require('./config');
const { createStore } = require('./store/redis');
const { createEventQueue } = require('./queue');
const { startEventWorker } = require('./worker');
const { registerUserRoutes } = require('./routes/users');
const { registerEventRoutes } = require('./routes/events');
const { registerDebugRoutes } = require('./routes/debug');
const { registerMetricRoutes } = require('./routes/metrics');

async function buildApp() {
  const config = loadConfig();
  const app = fastify({ logger: true });
  const store = createStore(config.redisUrl, app.log);
  const events = createEventQueue(config.redisUrl, app.log);
  const worker = config.redisUrl
    ? startEventWorker({ redisUrl: config.redisUrl, store, logger: app.log })
    : null;

  app.get('/health', async () => ({ ok: true }));
  registerUserRoutes(app, { store });
  registerEventRoutes(app, { store, events });
  registerDebugRoutes(app, { store });
  registerMetricRoutes(app, { store });

  app.addHook('onClose', async () => {
    if (worker) await worker.close();
    if (events) await events.close();
    if (store) await store.close();
  });

  return app;
}

function warnIfFirebaseMissing(config, logger) {
  if (!config.firebaseCredentialsPath) {
    logger.warn('GOOGLE_APPLICATION_CREDENTIALS is unset; debug push will fail');

    return;
  }

  if (!fs.existsSync(config.firebaseCredentialsPath)) {
    logger.error('Firebase credentials file is missing; debug push will fail');
  }
}

async function start() {
  const config = loadConfig();

  if (!config.redisUrl) {
    console.error('REDIS_URL is required');
    process.exit(1);
  }

  const app = await buildApp();

  warnIfFirebaseMissing(config, app.log);
  const port = Number(process.env.PORT) || 3000;

  await app.listen({ port, host: '0.0.0.0' });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildApp };
