const { loadConfig } = require('../config');
const { buildContext } = require('../pipeline/context');
const { createRecommendation } = require('../pipeline/deliver');
const { localDate } = require('../pipeline/local-time');
const { evaluatePolicy } = require('../pipeline/policy');
const { reasonAboutContext } = require('../pipeline/reasoner');
const { matchTrigger } = require('../pipeline/triggers');
const { sendDataMessage } = require('../push');

const FEEDBACK_FIELDS = {
  recommendation_shown: 'shown',
  recommendation_opened: 'opened',
  recommendation_dismissed: 'dismissed',
};

async function processEvent(job, {
  store,
  logger,
  lookupWeather,
  reason = reasonAboutContext,
  send = sendDataMessage,
  demoMode = loadConfig().demoMode,
}) {
  const { user_id: userId, event } = job.data;
  const user = await store.getUser(userId);

  if (!user) {
    logger.warn({ userId, eventId: event.event_id }, 'event for unknown user');

    return { status: 'unknown_user' };
  }

  const feedbackField = FEEDBACK_FIELDS[event.type];

  if (feedbackField) {
    const feedback = await store.recordFeedback(userId, {
      recommendationId: event.props.recommendation_id,
      field: feedbackField,
      eventTs: event.ts,
    });

    logger.info({
      userId,
      type: event.type,
      recommendationId: event.props.recommendation_id,
      feedback: feedback.status,
    }, 'recommendation feedback');

    return {
      status: feedback.status === 'counted' ? 'feedback' : feedback.status,
      field: feedbackField,
      persona_id: feedback.persona_id || null,
      trigger_id: feedback.trigger_id || null,
    };
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

  const policy = evaluatePolicy({
    decision: reasoned.decision,
    user: updated,
    eventTs: event.ts,
    demoMode,
  });

  if (!policy.allow) {
    logger.info({ userId, reason: policy.reason }, 'recommendation suppressed');

    return {
      status: 'suppressed',
      reason: policy.reason,
      trigger,
      context,
      decision: reasoned.decision,
      source: reasoned.source,
      usage: updated.usage,
    };
  }

  const data = createRecommendation({
    serviceId: reasoned.decision.service_id,
    cta: reasoned.decision.cta,
    fromTs: event.ts,
  });

  try {
    const messageId = await send(updated.fcm_token, data);

    await store.recordPush(userId, {
      eventTs: event.ts,
      localDay: localDate(event.ts),
      recommendation: {
        ...data,
        reason: reasoned.decision.reason,
        confidence: reasoned.decision.confidence,
        trigger_id: trigger.id,
      },
    });

    logger.info({ userId, messageId, recommendationId: data.recommendation_id }, 'recommendation sent');

    return {
      status: 'sent',
      message_id: messageId,
      data,
      trigger,
      context,
      decision: reasoned.decision,
      source: reasoned.source,
      usage: updated.usage,
    };
  } catch (error) {
    if (error.code === 'firebase_not_configured') {
      logger.warn({ userId, recommendationId: data.recommendation_id }, 'recommendation not sent');

      return {
        status: 'delivery_failed',
        reason: 'firebase_not_configured',
        data,
        trigger,
        context,
        decision: reasoned.decision,
        source: reasoned.source,
      };
    }

    throw error;
  }
}

module.exports = { processEvent };
