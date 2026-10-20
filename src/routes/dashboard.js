const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { loadConfig } = require('../config');
const { demoUserId } = require('../config/persona-presets');
const { personas } = require('../../scripts/eval-personas');
const { processEvent } = require('../worker/process');

const pagePath = path.join(__dirname, '../../public/dashboard.html');

function publicPersona(persona) {
  return {
    id: persona.id,
    name: persona.name,
    subtitle: persona.subtitle,
    full_name: persona.profile.fullName,
    occupation: persona.profile.occupation,
    usage_frequency: persona.profile.usageFrequency,
    context: persona.context,
    behavior: persona.behavior[0],
    usage: persona.usage,
    user_id: demoUserId(persona),
  };
}

function registerDashboardRoutes(app, { store, live }) {
  app.get('/', async (_request, reply) => reply.redirect('/dashboard'));

  app.get('/dashboard', async (_request, reply) => {
    reply.type('text/html; charset=utf-8').send(fs.readFileSync(pagePath));
  });

  app.get('/v1/dashboard/personas', async () => ({
    personas: personas.map(publicPersona),
  }));

  app.get('/v1/live', async (request, reply) => {
    const metrics = store ? await store.getMetrics().catch(() => []) : [];

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    reply.raw.write(`data: ${JSON.stringify({
      type: 'hello',
      metrics,
      latest: live.latest(),
      demo_mode: loadConfig().demoMode,
    })}\n\n`);

    const unsubscribe = live.subscribe((event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 20000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post('/v1/dashboard/run', async (request, reply) => {
    if (!store) return reply.code(503).send({ error: 'redis_unavailable' });

    const persona = personas.find((item) => item.id === (request.body && request.body.persona_id));

    if (!persona) return reply.code(404).send({ error: 'unknown_persona' });

    const userId = demoUserId(persona);
    let existing;

    try {
      existing = await store.getUser(userId);

      if (!existing) {
        const token = loadConfig().fcmToken || 'dashboard';

        await store.replaceUser({
          user_id: userId,
          fcm_token: token,
          persona,
          usage: persona.usage,
        });
      }
    } catch (error) {
      request.log.error({ err: error }, 'failed to prepare demo user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    try {
      return await processEvent({
        data: {
          user_id: userId,
          event: {
            event_id: randomUUID(),
            type: 'persona_registered',
            ts: new Date().toISOString(),
            props: {},
          },
        },
      }, {
        store,
        logger: request.log,
        live,
        demoMode: loadConfig().demoMode,
      });
    } catch (error) {
      request.log.error({ err: error }, 'dashboard run failed');

      return reply.code(500).send({ error: 'run_failed' });
    }
  });

  app.post('/v1/dashboard/reset', async (request, reply) => {
    if (!store) return reply.code(503).send({ error: 'redis_unavailable' });

    const persona = personas.find((item) => item.id === (request.body && request.body.persona_id));

    if (!persona) return reply.code(404).send({ error: 'unknown_persona' });

    try {
      const user = await store.clearCooldowns(demoUserId(persona));

      if (!user) return reply.code(404).send({ error: 'unknown_user' });

      return { user_id: user.user_id };
    } catch (error) {
      request.log.error({ err: error }, 'failed to reset demo user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }
  });
}

module.exports = { registerDashboardRoutes };
