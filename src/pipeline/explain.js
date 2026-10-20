function explainDelivery({ status, reason, name, demoMode }) {
  const who = name || 'This person';

  if (status === 'sent') return `Sent to ${who}.`;

  if (status === 'delivery_failed' && reason === 'firebase_not_configured') {
    return 'The recommendation is ready. This server cannot reach a phone yet.';
  }

  if (status === 'delivery_failed') return 'The recommendation is ready, but the phone could not be reached.';

  if (reason === 'cooldown') {
    return demoMode
      ? `${who} was notified in the last 2 minutes, so this one was held.`
      : `${who} was notified in the last 4 hours, so this one was held.`;
  }

  if (reason === 'confidence') return 'Held. The reasoner was not confident enough.';
  if (reason === 'should_notify') return 'The reasoner decided this person should not be notified.';
  if (reason === 'daily_cap') return `${who} already received 3 notifications today.`;
  if (reason === 'quiet_hours') return 'Held for quiet hours, 02:00 to 08:00 UTC.';
  if (reason === 'service_cooldown') return 'Held. They just used this service.';
  if (reason === 'unknown_service') return 'Held. That service is not in the catalog.';

  return 'Held.';
}

function sourceLabel(source) {
  if (source === 'model') return 'Written by the model';

  return 'Written from the fallback';
}

module.exports = { explainDelivery, sourceLabel };
