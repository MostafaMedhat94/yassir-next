const { isLateNight, isWeekendMorning, localParts, mealSlot } = require('./local-time');

function matchTrigger(event) {
  if (event.type === 'persona_registered') {
    return { id: 'persona_registered', likely_service: 'food' };
  }

  const local = localParts(event.ts);

  if (event.type === 'trip_started' && event.props.destination_label === 'home') {
    const meal = mealSlot(local);

    if (meal) return { id: 'heading_home_meal', likely_service: 'food', meal };
  }

  if (event.type === 'trip_completed' && event.props.destination_label === 'airport') {
    return { id: 'airport_arrival', likely_service: 'pay' };
  }

  if (event.type === 'trip_completed' && isLateNight(local)) {
    return { id: 'late_night_completed', likely_service: 'food' };
  }

  if (event.type === 'app_opened' && isWeekendMorning(local)) {
    return { id: 'weekend_morning_open', likely_service: 'grocery' };
  }

  return null;
}

module.exports = { matchTrigger };
