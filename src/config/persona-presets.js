const USAGE_PRESETS = {
  daily_commuter: { go: 42, food: 0, grocery: 0, pay: 0 },
  budget_student: { go: 14, food: 8, grocery: 0, pay: 0 },
  business_traveler: { go: 36, food: 12, grocery: 0, pay: 0 },
  night_out: { go: 9, food: 3, grocery: 0, pay: 0 },
  occasional_rider: { go: 2, food: 0, grocery: 0, pay: 0 },
};

function usageForPersona(personaId) {
  const preset = USAGE_PRESETS[personaId];

  return preset ? { ...preset } : null;
}

function demoUserId(persona) {
  const name = persona.profile.fullName.trim().toLowerCase().replace(/\s+/g, '-');

  return `demo-${name}`;
}

module.exports = { USAGE_PRESETS, usageForPersona, demoUserId };
