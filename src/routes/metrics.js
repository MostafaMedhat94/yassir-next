function registerMetricRoutes(app, { store }) {
  app.get('/v1/metrics', async (request, reply) => {
    if (!store) return reply.code(503).send({ error: 'redis_unavailable' });

    try {
      return { metrics: await store.getMetrics() };
    } catch (error) {
      request.log.error({ err: error }, 'failed to load metrics');

      return reply.code(503).send({ error: 'redis_unavailable' });
    }
  });
}

module.exports = { registerMetricRoutes };
