const { loadConfig } = require('../src/config');
const { demoUserId } = require('../src/config/persona-presets');
const { createStore } = require('../src/store/redis');
const { personas } = require('./eval-personas');

function demoUsers(fcmToken) {
  return personas.map((persona) => ({
    user_id: demoUserId(persona),
    fcm_token: fcmToken,
    persona,
    usage: persona.usage,
  }));
}

async function main() {
  const config = loadConfig();
  const fcmToken = (process.env.FCM_TOKEN || '').trim();

  if (!config.redisUrl) {
    console.error('Set REDIS_URL before seeding.');
    process.exit(1);
  }

  if (!fcmToken) {
    console.error('Set FCM_TOKEN before seeding. All five demo users share that device token.');
    process.exit(1);
  }

  const store = createStore(config.redisUrl, console);
  const users = demoUsers(fcmToken);

  try {
    for (const user of users) {
      await store.replaceUser(user);
      console.log(`${user.user_id}\t${user.persona.id}`);
    }
  } finally {
    await store.close();
  }

  console.error(`${users.length} demo users seeded`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { demoUsers };
