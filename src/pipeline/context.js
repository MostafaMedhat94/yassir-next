const { SERVICE_IDS } = require('../config/catalog');
const { localParts, mealSlot } = require('./local-time');
const { fetchWeather } = require('./weather');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(local) {
  const hour = Math.floor(local.minutes / 60);
  const minute = local.minutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function summarizePersona(persona) {
  const profile = persona.profile || {};

  return {
    id: persona.id,
    name: persona.name,
    full_name: profile.fullName || null,
    subtitle: persona.subtitle || null,
    occupation: profile.occupation || null,
    usage_frequency: profile.usageFrequency || null,
    context: persona.context || null,
    behavior: persona.behavior || [],
    primary_motivation: persona.primaryMotivation || null,
    pain_points: persona.keyPainPoints || [],
  };
}

async function buildContext({ user, event, trigger, lookupWeather = fetchWeather, logger }) {
  const local = localParts(event.ts);
  const hasLocation = event.props && event.props.lat != null && event.props.lng != null;
  const weather = hasLocation
    ? await lookupWeather(event.props.lat, event.props.lng, { logger })
    : null;

  return {
    trigger,
    persona: summarizePersona(user.persona),
    local: {
      time: formatTime(local),
      day: DAY_NAMES[local.day],
      meal: mealSlot(local),
    },
    weather,
    usage: user.usage,
    last_used: user.last_used,
    unused_services: SERVICE_IDS.filter((serviceId) => user.usage[serviceId] === 0),
    event: {
      type: event.type,
      ts: event.ts,
      destination_label: (event.props && event.props.destination_label) || null,
      eta_min: event.props && event.props.eta_min != null ? event.props.eta_min : null,
    },
  };
}

module.exports = { buildContext };
