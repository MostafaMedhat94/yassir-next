const Redis = require('ioredis');

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

    async close() {
      if (redis.status === 'wait' || redis.status === 'end') return;
      await redis.quit();
    },
  };
}

module.exports = { createStore };
