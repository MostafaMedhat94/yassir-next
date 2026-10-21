const fs = require('fs');
const { buildContext } = require('../src/pipeline/context');
const { reasonAboutContext } = require('../src/pipeline/reasoner');
const { matchTrigger } = require('../src/pipeline/triggers');
const { loadConfig } = require('../src/config');

const personas = [
  {
    id: 'daily_commuter',
    name: 'The Daily Commuter',
    subtitle: 'The Efficiency Seeker',
    profile: { fullName: 'Maya', age: 29, occupation: 'Corporate Consultant', usageFrequency: 'Daily' },
    context: 'Relies on ride-hailing during morning and evening rush hours between home, client offices, and transit hubs.',
    behavior: [
      'Schedules rides or books instantly at fixed times.',
      'Highly sensitive to delays, ETA accuracy, and surge pricing.',
      'Prefers quiet, professional rides so she can prep for meetings.',
    ],
    keyPainPoints: ['Unreliable ETAs', 'Sudden surge multipliers', 'Drivers taking sub-optimal routes'],
    primaryMotivation: 'Speed, predictability, and minimal friction.',
    usage: { go: 42, food: 0, grocery: 0, pay: 0 },
  },
  {
    id: 'budget_student',
    name: 'The Budget-Conscious Student',
    subtitle: 'The Value Maximizer',
    profile: { fullName: 'Omar', age: 21, occupation: 'University Student', usageFrequency: 'Several times a week' },
    context: 'Trips between campus, late-night study groups, social hangouts, and home on a strict budget.',
    behavior: [
      'Compares prices and will wait or walk if the fare drops.',
      'Splits payments with friends after group rides.',
      'Already orders food when the discount is obvious.',
    ],
    keyPainPoints: ['Unexpected high fares', 'Hard bill splitting', 'Few rewards for short trips'],
    primaryMotivation: 'Lowest price and social convenience.',
    usage: { go: 14, food: 8, grocery: 0, pay: 0 },
  },
  {
    id: 'business_traveler',
    name: 'The Business Traveler',
    subtitle: 'The Seamless Executive',
    profile: { fullName: 'David', age: 45, occupation: 'Sales VP', usageFrequency: 'Weekly travel' },
    context: 'Airport transfers, hotel pickups, and back-to-back client visits in unfamiliar cities.',
    behavior: [
      'Chooses premium rides for space and reliability.',
      'Needs receipts he can expense without extra admin.',
      'Relies on scheduled airport pickups.',
    ],
    keyPainPoints: ['Confusing airport pickups', 'Messy expense exports', 'Inconsistent premium vehicles'],
    primaryMotivation: 'Comfort, reliability, and automated admin.',
    usage: { go: 36, food: 12, grocery: 0, pay: 0 },
  },
  {
    id: 'night_out',
    name: 'The Night Out Passenger',
    subtitle: 'The Protection Seeker',
    profile: { fullName: 'Sarah', age: 26, occupation: 'Graphic Designer', usageFrequency: 'Weekends and late evenings' },
    context: 'Returns home after evening social events, bars, or late shifts and cares first about getting there safely.',
    behavior: [
      'Shares live ride tracking with someone she trusts.',
      'Checks the plate, driver, and PIN before getting in.',
      'Looks for visible safety controls during the ride.',
    ],
    keyPainPoints: ['Unsettling driver behavior', 'Wrong pickups on dark streets', 'No obvious safety controls'],
    primaryMotivation: 'Personal safety and peace of mind.',
    usage: { go: 9, food: 3, grocery: 0, pay: 0 },
  },
  {
    id: 'occasional_rider',
    name: 'The Occasional Rider',
    subtitle: 'The Accessibility Seeker',
    profile: { fullName: 'Elena', age: 68, occupation: 'Retired Teacher', usageFrequency: 'A couple of times a month' },
    context: 'Uses ride-hailing a couple of times a month for medical appointments, shopping, and visits when family is unavailable.',
    behavior: [
      'Prefers a larger vehicle and help with bags.',
      'Wants short, plain instructions.',
      'Would rather talk with the driver than use in-app chat.',
    ],
    keyPainPoints: ['Pickups across busy streets', 'Cancellations when she has bags', 'Hard-to-read screens'],
    primaryMotivation: 'Accessibility, patience, and ease of use.',
    usage: { go: 2, food: 0, grocery: 0, pay: 0 },
  },
];

const scenarios = [
  {
    name: 'dinner-rain',
    weather: { condition: 'rain', weather_code: 61, temperature_c: 17, precipitation_mm: 0.4 },
    event: {
      type: 'trip_started',
      ts: '2026-10-22T19:30:00+01:00',
      props: { destination_label: 'home', eta_min: 18, lat: 36.75, lng: 3.06 },
    },
  },
  {
    name: 'dinner-clear',
    weather: { condition: 'clear', weather_code: 0, temperature_c: 22, precipitation_mm: 0 },
    event: {
      type: 'trip_started',
      ts: '2026-10-22T19:30:00+01:00',
      props: { destination_label: 'home', eta_min: 18, lat: 36.75, lng: 3.06 },
    },
  },
  {
    name: 'airport-clear',
    weather: { condition: 'clear', weather_code: 0, temperature_c: 24, precipitation_mm: 0 },
    event: {
      type: 'trip_completed',
      ts: '2026-10-22T15:00:00+01:00',
      props: { destination_label: 'airport', lat: 36.69, lng: 3.22 },
    },
  },
  {
    name: 'late-night-clear',
    weather: { condition: 'clear', weather_code: 0, temperature_c: 16, precipitation_mm: 0 },
    event: {
      type: 'trip_completed',
      ts: '2026-10-23T01:10:00+01:00',
      props: { destination_label: 'home', lat: 36.75, lng: 3.06 },
    },
  },
  {
    name: 'weekend-clear',
    weather: { condition: 'clear', weather_code: 0, temperature_c: 20, precipitation_mm: 0 },
    event: {
      type: 'app_opened',
      ts: '2026-10-24T09:15:00+01:00',
      props: { lat: 36.75, lng: 3.06 },
    },
  },
  {
    name: 'weekend-rain',
    weather: { condition: 'rain', weather_code: 63, temperature_c: 18, precipitation_mm: 1.1 },
    event: {
      type: 'app_opened',
      ts: '2026-10-24T09:15:00+01:00',
      props: { lat: 36.75, lng: 3.06 },
    },
  },
];

function buildCases() {
  const cases = [];

  for (const persona of personas) {
    for (const scenario of scenarios) {
      const event = {
        event_id: '00000000-0000-4000-8000-000000000001',
        ...scenario.event,
      };
      const trigger = matchTrigger(event);

      if (!trigger) {
        throw new Error(`${scenario.name} is not a recommendation moment`);
      }

      cases.push({ persona, scenario: scenario.name, event, trigger, weather: scenario.weather });
    }
  }

  return cases;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTable(rows) {
  const header = '| Persona | Moment | Notify | Service | Confidence | Source | CTA |';
  const rule = '| --- | --- | --- | --- | --- | --- | --- |';
  const lines = rows.map((row) => {
    const cta = row.cta.replace(/\|/g, '/');

    return `| ${row.persona} | ${row.scenario} | ${row.should_notify} | ${row.service_id} | ${row.confidence} | ${row.source} | ${cta} |`;
  });

  return [header, rule, ...lines].join('\n');
}

async function evaluateCase(item) {
  const context = await buildContext({
    user: {
      persona: item.persona,
      usage: item.persona.usage,
      last_used: {},
    },
    event: item.event,
    trigger: item.trigger,
    lookupWeather: async () => item.weather,
  });

  const pauses = [0, 4000, 10000];
  let result;

  for (const pause of pauses) {
    if (pause) await sleep(pause);

    result = await reasonAboutContext(context, { logger: console, llmTimeoutMs: 20000 });

    if (result.source === 'model' || result.source === 'cursor' || result.source === 'invalid_output') break;
  }

  return {
    persona: item.persona.profile.fullName,
    persona_id: item.persona.id,
    scenario: item.scenario,
    trigger: item.trigger.id,
    should_notify: result.decision.should_notify,
    service_id: result.decision.service_id,
    confidence: result.decision.confidence,
    source: result.source,
    cta: result.decision.cta,
    reason: result.decision.reason,
  };
}

async function main() {
  const cases = buildCases();

  if (process.argv.includes('--dry')) {
    for (const item of cases) {
      console.log(`${item.persona.id}\t${item.scenario}\t${item.trigger.id}\t${item.weather.condition}`);
    }

    console.error(`${cases.length} cases`);

    return;
  }

  if (!loadConfig().llmApiKey) {
    console.error('Set LLM_API_KEY to run the live evaluation. Use --dry to print the case list.');
    process.exit(1);
  }

  const rows = [];

  for (const item of cases) {
    const row = await evaluateCase(item);

    rows.push(row);
    fs.writeFileSync('eval-results.json', `${JSON.stringify(rows, null, 2)}\n`);
    console.error(`${rows.length}/${cases.length} ${row.persona} ${row.scenario} ${row.source} ${row.service_id}`);
    await sleep(1500);
  }

  const table = formatTable(rows);

  fs.writeFileSync('eval-results.json', `${JSON.stringify(rows, null, 2)}\n`);
  console.log(table);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildCases, personas, scenarios };
