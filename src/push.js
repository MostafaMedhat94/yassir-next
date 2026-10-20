const admin = require('firebase-admin');

let messaging = null;

function getMessaging() {
  if (messaging) return messaging;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  messaging = admin.messaging();

  return messaging;
}

async function sendDataMessage(token, data) {
  const client = getMessaging();

  if (!client) {
    const error = new Error('firebase_not_configured');

    error.code = 'firebase_not_configured';

    throw error;
  }

  const payload = {};

  for (const [key, value] of Object.entries(data || {})) {
    const text = value == null ? '' : String(value);

    if (text.trim()) payload[key] = text;
  }

  return client.send({
    token,
    data: payload,
    android: { priority: 'high' },
  });
}

module.exports = { sendDataMessage };
