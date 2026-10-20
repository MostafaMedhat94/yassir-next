const { loadConfig } = require('../src/config');
const { processEvent } = require('../src/worker/process');
const { createStore } = require('../src/store/redis');

const DINNER = {
  type: 'trip_started',
  ts: '2026-10-22T19:30:00+01:00',
  props: { destination_label: 'home', eta_min: 18, lat: 36.75, lng: 3.06 },
};

const logger = {
  info() {},
  warn(details, message) {
    console.error(message || details);
  },
  error(details, message) {
    console.error(message || details);
  },
};

function dinnerEvent(eventId) {
  return { event_id: eventId, ...DINNER };
}

async function runPass(store, userId, eventId) {
  await store.clearCooldowns(userId);

  return processEvent({
    data: { user_id: userId, event: dinnerEvent(eventId) },
  }, {
    store,
    logger,
    demoMode: true,
    lookupWeather: async () => ({ condition: 'rain', weather_code: 61, temperature_c: 17, precipitation_mm: 0.4 }),
    send: async () => 'rehearsal',
  });
}

function allowed(result) {
  return result.status === 'sent' || result.status === 'delivery_failed';
}

async function main() {
  const config = loadConfig();

  if (!config.redisUrl) {
    console.error('Set REDIS_URL before rehearsing.');
    process.exit(1);
  }

  const store = createStore(config.redisUrl, console);

  try {
    const maya = await store.getUser('demo-maya');
    const omar = await store.getUser('demo-omar');

    if (!maya || !omar) {
      console.error('Seed the demo users first: FCM_TOKEN=... npm run seed');
      process.exit(1);
    }

    const first = await runPass(store, 'demo-maya', '00000000-0000-4000-8000-0000000000a1');
    const blocked = await processEvent({
      data: { user_id: 'demo-maya', event: dinnerEvent('00000000-0000-4000-8000-0000000000a2') },
    }, {
      store,
      logger,
      demoMode: true,
      lookupWeather: async () => ({ condition: 'rain', weather_code: 61, temperature_c: 17, precipitation_mm: 0.4 }),
      send: async () => 'rehearsal',
    });
    const second = await runPass(store, 'demo-maya', '00000000-0000-4000-8000-0000000000a3');
    const third = await runPass(store, 'demo-maya', '00000000-0000-4000-8000-0000000000a4');
    const otherPersona = await runPass(store, 'demo-omar', '00000000-0000-4000-8000-0000000000b1');

    const passes = [first, second, third];
    const failed = passes.some((result) => !allowed(result)) || blocked.status !== 'suppressed';

    for (const [index, result] of passes.entries()) {
      console.log(`${index + 1}\tdemo-maya\t${result.status}\t${result.reason || ''}\t${result.data ? result.data.CTA : ''}`);
    }

    console.log(`cooldown\tdemo-maya\t${blocked.status}\t${blocked.reason || ''}`);
    console.log(`persona\tdemo-omar\t${otherPersona.status}\t${otherPersona.source || ''}\t${otherPersona.data ? otherPersona.data.CTA : ''}`);

    if (failed) process.exit(1);
  } finally {
    await store.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
