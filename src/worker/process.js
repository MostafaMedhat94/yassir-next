const { matchTrigger } = require('../pipeline/triggers');

async function processEvent(job, { store, logger }) {
  const { user_id: userId, event } = job.data;
  const user = await store.getUser(userId);

  if (!user) {
    logger.warn({ userId, eventId: event.event_id }, 'event for unknown user');

    return { status: 'unknown_user' };
  }

  const updated = await store.applyEvent(userId, event);
  const trigger = matchTrigger(event);

  if (!trigger) {
    logger.info({ userId, type: event.type, usage: updated.usage }, 'event stopped');

    return { status: 'stopped', usage: updated.usage };
  }

  logger.info({ userId, type: event.type, trigger, usage: updated.usage }, 'trigger matched');

  return { status: 'triggered', trigger, usage: updated.usage };
}

module.exports = { processEvent };
