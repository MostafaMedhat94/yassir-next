function loadConfig() {
  return {
    redisUrl: (process.env.REDIS_URL || '').trim(),
    firebaseCredentialsPath: (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim(),
    llmApiKey: (process.env.LLM_API_KEY || '').trim(),
    llmModel: (process.env.LLM_MODEL || 'gemini-3.5-flash-lite').trim(),
    llmTimeoutMs: Math.min(Number(process.env.LLM_TIMEOUT_MS) || 8000, 8000),
    demoMode: (process.env.DEMO_MODE || '').trim() === 'true',
    fcmToken: (process.env.FCM_TOKEN || '').trim(),
  };
}

module.exports = { loadConfig };
