const { Queue } = require('bullmq');

function bullmqConnection(redisUrl) {
  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    family: 4,
  };
}

function createEventQueue(redisUrl, logger) {
  if (!redisUrl) return null;

  const queue = new Queue('events', {
    connection: bullmqConnection(redisUrl),
  });

  queue.on('error', (error) => {
    logger.error({ err: error }, 'event queue error');
  });

  return {
    async add(userId, event) {
      await queue.add(
        'ingest',
        { user_id: userId, event },
        {
          jobId: event.event_id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
    },

    async close() {
      await queue.close();
    },
  };
}

function isDuplicateJobError(error) {
  return /already exists/i.test(error.message);
}

module.exports = { bullmqConnection, createEventQueue, isDuplicateJobError };
