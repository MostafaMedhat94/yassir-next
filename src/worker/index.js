const { Worker } = require('bullmq');
const { bullmqConnection } = require('../queue');
const { processEvent } = require('./process');

function startEventWorker({ redisUrl, store, logger }) {
  const worker = new Worker(
    'events',
    (job) => processEvent(job, { store, logger }),
    { connection: bullmqConnection(redisUrl) },
  );

  worker.on('failed', (job, error) => {
    logger.error({ err: error, jobId: job && job.id }, 'event job failed');
  });

  worker.on('error', (error) => {
    logger.error({ err: error }, 'event worker error');
  });

  return worker;
}

module.exports = { startEventWorker };
