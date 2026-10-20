const { randomBytes } = require('crypto');
const { SERVICES } = require('../config/catalog');
const { debugPushBodySchema, validationError } = require('../contracts');
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
}

function buildCatalogPayload(body) {
  const service = SERVICES[body.service_id];
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  return {
    recommendation_id: `rec_${randomBytes(4).toString('hex')}`,
    service_id: service.service_id,
    service_name: service.service_name,
    CTA: body.CTA || `Open ${service.service_name}`,
    service_deep_link: service.service_deep_link,
    expires_at: expiresAt,
  };
}

module.exports = { registerDebugRoutes };
