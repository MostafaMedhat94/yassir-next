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
      await redis.hset(`user:${user.user_id}`, {
        fcm_token: user.fcm_token,
        persona: JSON.stringify(user.persona),
        usage: JSON.stringify(user.usage),
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
      };
    },

    async close() {
      if (redis.status === 'wait' || redis.status === 'end') return;
      await redis.quit();
    },
  };
}

module.exports = { createStore };
