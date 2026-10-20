function loadConfig() {
  return {
    redisUrl: (process.env.REDIS_URL || '').trim(),
    firebaseCredentialsPath: (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim(),
  };
}

module.exports = { loadConfig };
