const { SERVICE_IDS } = require('../config/catalog');

const SIGNALS = {
  food: ['food', 'meal', 'meals', 'dinner', 'lunch', 'hungry', 'restaurant'],
  grocery: ['grocery', 'groceries', 'shopping', 'supermarket', 'errand', 'errands'],
  pay: ['pay', 'payment', 'payments', 'split', 'splitting', 'bill', 'receipt', 'receipts', 'expense', 'expenses', 'wallet', 'fare', 'fares'],
  go: ['ride', 'rides', 'commute', 'commuting', 'airport', 'pickup', 'pickups', 'driver', 'drivers'],
};

function personaText(persona) {
  const profile = persona.profile || {};

  return [
    persona.context,
    persona.primaryMotivation,
    persona.subtitle,
    profile.occupation,
    ...(persona.behavior || []),
    ...(persona.keyPainPoints || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function signalScore(text, words) {
  return words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

function registrationService(persona, usage) {
  const counts = usage || {};
  const unused = SERVICE_IDS.filter((serviceId) => !counts[serviceId]);
  const pool = unused.length ? unused : ['food'];
  const text = personaText(persona || {});
  let bestId = pool[0];
  let bestScore = -1;

  for (const serviceId of pool) {
    const score = signalScore(text, SIGNALS[serviceId] || []);

    if (score > bestScore) {
      bestScore = score;
      bestId = serviceId;
    }
  }

  if (bestScore > 0) return bestId;
  if (pool.includes('food')) return 'food';
  if (pool.includes('pay')) return 'pay';

  return pool.includes('grocery') ? 'grocery' : pool[0];
}

module.exports = { registrationService };
