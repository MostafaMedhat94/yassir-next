function loadConfig() {
  return {
    redisUrl: (process.env.REDIS_URL || '').trim(),
    firebaseCredentialsPath: (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim(),
    llmApiKey: (process.env.LLM_API_KEY || '').trim(),
    llmModel: (process.env.LLM_MODEL || 'gemini-3.8-flash').trim(),
    llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 4000,
  };
}

module.exports = { loadConfig };
