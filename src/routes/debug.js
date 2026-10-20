const { randomBytes } = require('crypto');
const { SERVICES } = require('../config/catalog');
const { debugPushBodySchema, validationError } = require('../contracts');
const { buildPushData } = require('../pipeline/deliver');
const { sendDataMessage } = require('../push');

function registerDebugRoutes(app, { store }) {
  app.post('/v1/debug/push', async (request, reply) => {
    const parsed = debugPushBodySchema.safeParse(request.body);

    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    if (!store) return reply.code(503).send({ error: 'redis_unavailable' });

    let user;

    try {
      user = await store.getUser(parsed.data.user_id);
    } catch (error) {
      request.log.error({ err: error }, 'failed to load user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    if (!user) return reply.code(404).send({ error: 'unknown_user' });

    const data = parsed.data.data
      ? { ...parsed.data.data }
      : buildCatalogPayload(parsed.data);

    try {
      const messageId = await sendDataMessage(user.fcm_token, data);

      return { message_id: messageId, data };
    } catch (error) {
      if (error.code === 'firebase_not_configured') {
        return reply.code(503).send({ error: 'firebase_not_configured' });
      }

      request.log.error({ err: error }, 'fcm send failed');

      return reply.code(502).send({ error: 'fcm_send_failed' });
    }
  });

  app.post('/v1/debug/reset/:user_id', async (request, reply) => {
    if (!store) return reply.code(503).send({ error: 'redis_unavailable' });

    let user;

    try {
      user = await store.clearCooldowns(request.params.user_id);
    } catch (error) {
      request.log.error({ err: error }, 'failed to reset user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    if (!user) return reply.code(404).send({ error: 'unknown_user' });

    return {
      user_id: user.user_id,
      last_push_at: user.last_push_at,
      push_count: user.push_count,
    };
  });
}

function buildCatalogPayload(body) {
  const service = SERVICES[body.service_id];

  return buildPushData({
    recommendationId: `rec_${randomBytes(4).toString('hex')}`,
    serviceId: service.service_id,
    cta: body.CTA || `Open ${service.service_name}`,
    title: body.title || service.service_name,
    description: body.description || service.description,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
}

module.exports = { registerDebugRoutes };
