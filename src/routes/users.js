const { randomUUID } = require('crypto');
const { loadConfig } = require('../config');
const { usageForPersona } = require('../config/persona-presets');
const { userBodySchema, validationError } = require('../contracts');
const { isOnCooldown } = require('../pipeline/policy');
const { isDuplicateJobError } = require('../queue');

function registerUserRoutes(app, { store, events }) {
  app.post('/v1/users', async (request, reply) => {
    const parsed = userBodySchema.safeParse(request.body);

    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    if (!store || !events) return reply.code(503).send({ error: 'redis_unavailable' });

    const body = parsed.data;
    let existing;

    try {
      existing = await store.getUser(body.user_id);
    } catch (error) {
      request.log.error({ err: error }, 'failed to load user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    const samePersona = existing && existing.persona.id === body.persona.id;
    const usage = body.usage
      || (samePersona ? existing.usage : null)
      || usageForPersona(body.persona.id);

    if (!usage) return reply.code(400).send({ error: 'unknown_persona' });

    try {
      await store.saveUser({ ...body, usage });
    } catch (error) {
      request.log.error({ err: error }, 'failed to save user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    let saved;

    try {
      saved = await store.getUser(body.user_id);
    } catch (error) {
      request.log.error({ err: error }, 'failed to load user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    const now = new Date().toISOString();

    if (isOnCooldown(saved, now, loadConfig().demoMode)) return { user_id: body.user_id };

    try {
      await events.add(body.user_id, {
        event_id: randomUUID(),
        type: 'persona_registered',
        ts: now,
        props: {},
      });
    } catch (error) {
      if (!isDuplicateJobError(error)) {
        request.log.error({ err: error }, 'failed to enqueue registration');

        return reply.code(503).send({ error: 'redis_unavailable' });
      }
    }

    return { user_id: body.user_id };
  });
}

module.exports = { registerUserRoutes };
