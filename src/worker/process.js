const { SERVICE_IDS } = require('../config/catalog');
const { loadConfig } = require('../config');
const { buildContext } = require('../pipeline/context');
const { createRecommendation } = require('../pipeline/deliver');
const { localDate } = require('../pipeline/local-time');
const { explainDelivery, sourceLabel } = require('../pipeline/explain');
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
  live,
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
  let trigger = matchTrigger(event);

  if (trigger && trigger.id === 'persona_registered') {
    const unused = SERVICE_IDS.filter((serviceId) => updated.usage[serviceId] === 0);

    trigger = { ...trigger, likely_service: unused[0] || 'food' };
  }

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
  const name = context.persona.full_name || updated.persona.name;
  const story = {
    full_name: name,
    usage: context.usage,
    unused: context.unused_services,
  };

  publish(live, {
    type: 'run',
    stage: 'context',
    run_id: event.event_id,
    user_id: userId,
    persona_id: context.persona.id,
    persona_name: context.persona.name,
    occupation: context.persona.occupation,
    behavior: context.persona.behavior[0] || context.persona.context,
    summary: `Reading ${name}. Asking for one recommendation.`,
    ...story,
  });

  const reasoned = await reason(context, { logger });

  logger.info({
    userId,
    source: reasoned.source,
    decision: reasoned.decision,
    context,
  }, 'recommendation reasoned');

  publish(live, {
    type: 'run',
    stage: 'decision',
    run_id: event.event_id,
    user_id: userId,
    persona_id: context.persona.id,
    ...story,
    decision: reasoned.decision,
    source: reasoned.source,
    source_label: sourceLabel(reasoned.source),
    summary: `${sourceLabel(reasoned.source)}.`,
  });

  const policy = evaluatePolicy({
    decision: reasoned.decision,
    user: updated,
    eventTs: event.ts,
    demoMode,
  });

  if (!policy.allow) {
    logger.info({ userId, reason: policy.reason }, 'recommendation suppressed');
    const summary = explainDelivery({ status: 'suppressed', reason: policy.reason, name, demoMode });

    publish(live, {
      type: 'run',
      stage: 'delivery',
      run_id: event.event_id,
      user_id: userId,
      persona_id: context.persona.id,
      ...story,
      decision: reasoned.decision,
      source: reasoned.source,
      source_label: sourceLabel(reasoned.source),
      status: 'suppressed',
      reason: policy.reason,
      summary,
    });

    return {
      status: 'suppressed',
      reason: policy.reason,
      summary,
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
    title: reasoned.decision.title,
    description: reasoned.decision.description,
    fromTs: event.ts,
  });

  try {
    const messageId = await send(updated.fcm_token, data);

    await store.recordPush(userId, {
      eventTs: event.ts,
      localDay: localDate(event.ts),
      recommendation: {
        ...data,
        title: data.title,
        description: data.description,
        reason: reasoned.decision.reason,
        confidence: reasoned.decision.confidence,
        trigger_id: trigger.id,
      },
    });

    logger.info({ userId, messageId, recommendationId: data.recommendation_id }, 'recommendation sent');
    const summary = explainDelivery({ status: 'sent', name, demoMode });

    publish(live, {
      type: 'run',
      stage: 'delivery',
      run_id: event.event_id,
      user_id: userId,
      persona_id: context.persona.id,
      ...story,
      decision: reasoned.decision,
      source: reasoned.source,
      source_label: sourceLabel(reasoned.source),
      status: 'sent',
      data,
      summary,
    });

    return {
      status: 'sent',
      message_id: messageId,
      summary,
      data,
      trigger,
      context,
      decision: reasoned.decision,
      source: reasoned.source,
      usage: updated.usage,
    };
  } catch (error) {
    const reason = error.code || 'fcm_send_failed';
    const summary = explainDelivery({ status: 'delivery_failed', reason, name, demoMode });

    logger.warn({ userId, message: error.message, recommendationId: data.recommendation_id }, 'recommendation not sent');
    publish(live, {
      type: 'run',
      stage: 'delivery',
      run_id: event.event_id,
      user_id: userId,
      persona_id: context.persona.id,
      ...story,
      decision: reasoned.decision,
      source: reasoned.source,
      source_label: sourceLabel(reasoned.source),
      status: 'delivery_failed',
      reason,
      data,
      summary,
    });

    return {
      status: 'delivery_failed',
      reason,
      summary,
      data,
      trigger,
      context,
      decision: reasoned.decision,
      source: reasoned.source,
    };
  }
}

function publish(live, event) {
  if (live) live.publish(event);
}

module.exports = { processEvent };
