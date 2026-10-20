const Redis = require('ioredis');

const METRIC_FIELDS = ['sent', 'shown', 'opened', 'dismissed'];

function metricKey(personaId, triggerId) {
  const safe = (value) => String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');

  return `metrics:${safe(personaId)}:${safe(triggerId)}`;
}

function createStore(redisUrl, logger) {
  if (!redisUrl) return null;

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 10000,
    family: 4,
    lazyConnect: true,
  });

  redis.on('error', (error) => {
    logger.error({ err: error }, 'redis error');
  });

  return {
    async ping() {
      if (redis.status === 'wait') await redis.connect();

      return redis.ping();
    },

    async saveUser(user) {
      if (redis.status === 'wait') await redis.connect();

      const existing = await this.getUser(user.user_id);
      const personaChanged = existing && existing.persona.id !== user.persona.id;
      const replaceHistory = !existing || personaChanged;

      await redis.hset(`user:${user.user_id}`, {
        fcm_token: user.fcm_token,
        persona: JSON.stringify(user.persona),
        usage: JSON.stringify(replaceHistory ? user.usage : existing.usage),
        last_used: JSON.stringify(replaceHistory ? {} : existing.last_used),
        last_push_at: replaceHistory ? '' : existing.last_push_at || '',
        push_count: replaceHistory ? '0' : String(existing.push_count || 0),
        push_day: replaceHistory ? '' : existing.push_day || '',
      });
    },

    async replaceUser(user) {
      if (redis.status === 'wait') await redis.connect();

      await redis.hset(`user:${user.user_id}`, {
        fcm_token: user.fcm_token,
        persona: JSON.stringify(user.persona),
        usage: JSON.stringify(user.usage),
        last_used: '{}',
        last_push_at: '',
        push_count: '0',
        push_day: '',
      });
    },

    async getUser(userId) {
      if (redis.status === 'wait') await redis.connect();

      const data = await redis.hgetall(`user:${userId}`);

      if (!data.fcm_token) return null;

      return {
        user_id: userId,
        fcm_token: data.fcm_token,
        persona: JSON.parse(data.persona),
        usage: JSON.parse(data.usage),
        last_used: data.last_used ? JSON.parse(data.last_used) : {},
        last_push_at: data.last_push_at || null,
        push_count: Number(data.push_count) || 0,
        push_day: data.push_day || null,
      };
    },

    async applyEvent(userId, event) {
      if (redis.status === 'wait') await redis.connect();

      const user = await this.getUser(userId);

      if (!user) return null;

      const usage = { ...user.usage };
      const lastUsed = { ...user.last_used };

      if (event.type === 'trip_completed') {
        usage.go += 1;
        lastUsed.go = event.ts;
      }

      if (event.type === 'service_used') {
        usage[event.props.service_id] += 1;
        lastUsed[event.props.service_id] = event.ts;
      }

      await redis.hset(`user:${userId}`, {
        usage: JSON.stringify(usage),
        last_used: JSON.stringify(lastUsed),
      });

      return { ...user, usage, last_used: lastUsed };
    },

    async recordPush(userId, { eventTs, localDay, recommendation }) {
      if (redis.status === 'wait') await redis.connect();

      const user = await this.getUser(userId);

      if (!user) return null;

      const pushCount = user.push_day === localDay ? user.push_count + 1 : 1;

      await redis.hset(`user:${userId}`, {
        last_push_at: eventTs,
        push_count: String(pushCount),
        push_day: localDay,
      });

      const triggerId = recommendation.trigger_id || 'unknown';

      await redis.hset(`rec:${recommendation.recommendation_id}`, {
        user_id: userId,
        persona_id: user.persona.id,
        service_id: recommendation.service_id,
        cta: recommendation.CTA,
        reason: recommendation.reason || '',
        confidence: String(recommendation.confidence),
        trigger_id: triggerId,
        expires_at: recommendation.expires_at,
        created_at: eventTs,
      });

      await this.incrementMetric(user.persona.id, triggerId, 'sent');

      return { ...user, last_push_at: eventTs, push_count: pushCount, push_day: localDay };
    },

    async getRecommendation(recommendationId) {
      if (redis.status === 'wait') await redis.connect();

      const data = await redis.hgetall(`rec:${recommendationId}`);

      if (!data.user_id) return null;

      return data;
    },

    async incrementMetric(personaId, triggerId, field) {
      if (redis.status === 'wait') await redis.connect();

      const key = metricKey(personaId, triggerId);

      await redis.hset(key, { persona_id: personaId, trigger_id: triggerId });
      const value = await redis.hincrby(key, field, 1);

      await redis.sadd('metrics:index', key);

      return Number(value);
    },

    async recordFeedback(userId, { recommendationId, field, eventTs }) {
      if (redis.status === 'wait') await redis.connect();

      const recommendation = await this.getRecommendation(recommendationId);

      if (!recommendation || recommendation.user_id !== userId) {
        return { status: 'unknown_recommendation' };
      }

      const personaId = recommendation.persona_id;
      const triggerId = recommendation.trigger_id;

      if (!personaId || !triggerId) return { status: 'unknown_recommendation' };

      const stamp = `${field}_at`;

      if (recommendation[stamp]) {
        return { status: 'duplicate', persona_id: personaId, trigger_id: triggerId };
      }

      await redis.hset(`rec:${recommendationId}`, stamp, eventTs);
      await this.incrementMetric(personaId, triggerId, field);

      return { status: 'counted', persona_id: personaId, trigger_id: triggerId };
    },

    async getMetrics() {
      if (redis.status === 'wait') await redis.connect();

      const keys = await redis.smembers('metrics:index');
      const metrics = [];

      for (const key of keys) {
        const data = await redis.hgetall(key);

        if (!data.persona_id) continue;

        const row = {
          persona_id: data.persona_id,
          trigger_id: data.trigger_id,
        };

        for (const field of METRIC_FIELDS) {
          row[field] = Number(data[field]) || 0;
        }

        metrics.push(row);
      }

      metrics.sort((left, right) => left.persona_id.localeCompare(right.persona_id)
        || left.trigger_id.localeCompare(right.trigger_id));

      return metrics;
    },

    async clearCooldowns(userId) {
      if (redis.status === 'wait') await redis.connect();

      const user = await this.getUser(userId);

      if (!user) return null;

      await redis.hset(`user:${userId}`, {
        last_push_at: '',
        push_count: '0',
        push_day: '',
        last_used: '{}',
      });

      return this.getUser(userId);
    },

    async close() {
      if (redis.status === 'wait' || redis.status === 'end') return;
      await redis.quit();
    },
  };
}

module.exports = { createStore };
