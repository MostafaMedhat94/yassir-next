const { userBodySchema, validationError } = require('../contracts');

function registerUserRoutes(app, { store }) {
  app.post('/v1/users', async (request, reply) => {
    const parsed = userBodySchema.safeParse(request.body);

    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    if (!store) return reply.code(503).send({ error: 'redis_unavailable' });

    try {
      await store.saveUser(parsed.data);
    } catch (error) {
      request.log.error({ err: error }, 'failed to save user');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }

    return { user_id: parsed.data.user_id };
  });
}

module.exports = { registerUserRoutes };
