const LUNCH_START = 12 * 60;
const LUNCH_END = 14 * 60;
const DINNER_START = 19 * 60;
const DINNER_END = 21 * 60 + 30;
const MORNING_START = 8 * 60;
const MORNING_END = 11 * 60;
const LATE_NIGHT_END = 5 * 60;

function offsetMinutes(ts) {
  if (ts.endsWith('Z')) return 0;

  const match = ts.match(/([+-])(\d{2}):(\d{2})$/);

  if (!match) return 0;

  const sign = match[1] === '+' ? 1 : -1;

  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function localParts(ts) {
  const shifted = new Date(new Date(ts).getTime() + offsetMinutes(ts) * 60 * 1000);

  return {
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    day: shifted.getUTCDay(),
  };
}

function mealSlot(local) {
  if (local.minutes >= LUNCH_START && local.minutes < LUNCH_END) return 'lunch';
  if (local.minutes >= DINNER_START && local.minutes <= DINNER_END) return 'dinner';

  return null;
}

function isWeekendMorning(local) {
  const weekend = local.day === 0 || local.day === 6;

  return weekend && local.minutes >= MORNING_START && local.minutes < MORNING_END;
}

function isLateNight(local) {
  return local.minutes < LATE_NIGHT_END;
}

module.exports = {
  localParts,
  mealSlot,
  isWeekendMorning,
  isLateNight,
};
