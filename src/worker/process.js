const { buildContext } = require('../pipeline/context');
const { reasonAboutContext } = require('../pipeline/reasoner');
const { matchTrigger } = require('../pipeline/triggers');

async function processEvent(job, { store, logger, lookupWeather, reason = reasonAboutContext }) {
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

  const context = await buildContext({
    user: updated,
    event,
    trigger,
    lookupWeather,
    logger,
  });

  const reasoned = await reason(context, { logger });

  logger.info({
    userId,
    source: reasoned.source,
    decision: reasoned.decision,
    context,
  }, 'recommendation reasoned');

  return {
    status: 'triggered',
    trigger,
    context,
    decision: reasoned.decision,
    source: reasoned.source,
    usage: updated.usage,
  };
}

module.exports = { processEvent };
