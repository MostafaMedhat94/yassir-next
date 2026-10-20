const { Queue } = require('bullmq');

function createEventQueue(redisUrl, logger) {
  if (!redisUrl) return null;

  const queue = new Queue('events', {
    connection: {
      url: redisUrl,
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
      family: 4,
    },
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

module.exports = { createEventQueue, isDuplicateJobError };
