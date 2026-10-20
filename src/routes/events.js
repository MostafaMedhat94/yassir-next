const { eventsBodySchema, validationError } = require('../contracts');
const { isDuplicateJobError } = require('../queue');

function registerEventRoutes(app, { store, events }) {
  app.post('/v1/events', async (request, reply) => {
    const parsed = eventsBodySchema.safeParse(request.body);

    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    if (!store || !events) return reply.code(503).send({ error: 'redis_unavailable' });

    let user;

    try {
      user = await store.getUser(parsed.data.user_id);
    } catch (error) {
      request.log.error({ err: error }, 'failed to load user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    if (!user) return reply.code(404).send({ error: 'unknown_user' });

    const accepted = [];

    for (const event of parsed.data.events) {
      try {
        await events.add(parsed.data.user_id, event);
      } catch (error) {
        if (!isDuplicateJobError(error)) {
          request.log.error({ err: error }, 'failed to enqueue event');

          return reply.code(503).send({ error: 'redis_unavailable' });
        }
      }

      accepted.push(event.event_id);
    }

    return reply.code(202).send({ accepted });
  });
}

module.exports = { registerEventRoutes };
