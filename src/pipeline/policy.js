const { SERVICES } = require('../config/catalog');
const { localDate, localParts } = require('./local-time');

const CONFIDENCE_MIN = 0.6;
const DAILY_CAP = 3;
const DEMO_COOLDOWN_MS = 2 * 60 * 1000;
const COOLDOWN_MS = 4 * 60 * 60 * 1000;
const QUIET_START = 2 * 60;
const QUIET_END = 8 * 60;

function cooldownMs(demoMode) {
  return demoMode ? DEMO_COOLDOWN_MS : COOLDOWN_MS;
}

function withinCooldown(earlierTs, eventTs, windowMs) {
  if (!earlierTs) return false;

  return Date.parse(eventTs) - Date.parse(earlierTs) < windowMs;
}

function isOnCooldown(user, eventTs, demoMode) {
  if (!user) return false;

  return withinCooldown(user.last_push_at, eventTs, cooldownMs(demoMode));
}

function evaluatePolicy({ decision, user, eventTs, demoMode }) {
  if (!decision.should_notify) return { allow: false, reason: 'should_notify' };
  if (decision.confidence < CONFIDENCE_MIN) return { allow: false, reason: 'confidence' };
  if (!SERVICES[decision.service_id]) return { allow: false, reason: 'unknown_service' };

  const local = localParts(eventTs);

  if (local.minutes >= QUIET_START && local.minutes < QUIET_END) {
    return { allow: false, reason: 'quiet_hours' };
  }

  const windowMs = cooldownMs(demoMode);

  if (withinCooldown(user.last_push_at, eventTs, windowMs)) {
    return { allow: false, reason: 'cooldown' };
  }

  const lastUsed = user.last_used && user.last_used[decision.service_id];

  if (withinCooldown(lastUsed, eventTs, windowMs)) {
    return { allow: false, reason: 'service_cooldown' };
  }

  const day = localDate(eventTs);
  const sentToday = user.push_day === day ? Number(user.push_count) || 0 : 0;

  if (sentToday >= DAILY_CAP) return { allow: false, reason: 'daily_cap' };

  return { allow: true };
}

module.exports = {
  CONFIDENCE_MIN,
  DAILY_CAP,
  evaluatePolicy,
  isOnCooldown,
};
