const CURSOR_API = 'https://api.cursor.com';
const TERMINAL = new Set(['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']);

function cursorPrompt(system, context, name) {
  return [
    system,
    '',
    'Reply with one JSON object only. Do not use tools. Do not add markdown.',
    `Address this person as ${name || 'them'} and nobody else.`,
    JSON.stringify(context),
  ].join('\n');
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const error = new Error('cursor_deadline');

      error.name = 'TimeoutError';
      reject(error);

      return;
    }

    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error('cursor_deadline');

      error.name = 'TimeoutError';
      reject(error);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function cursorJson(path, options, config) {
  const response = await config.fetchImpl(`${CURSOR_API}${path}`, options);
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`cursor_http_${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 180)}`);

    error.name = 'LlmHttpError';
    throw error;
  }

  return text ? JSON.parse(text) : {};
}

function cleanupAgent(agentId, runId, headers, config) {
  const cancel = cursorJson(`/v1/agents/${agentId}/runs/${runId}/cancel`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(2000),
  }, config).catch(() => {});

  return cancel.then(() => cursorJson(`/v1/agents/${agentId}`, {
    method: 'DELETE',
    headers,
    signal: AbortSignal.timeout(2000),
  }, config).catch(() => {}));
}

async function pollRun(agentId, runId, headers, signal, config) {
  while (!signal.aborted) {
    const run = await cursorJson(`/v1/agents/${agentId}/runs/${runId}`, { headers, signal }, config);

    if (TERMINAL.has(run.status)) return run;

    await delay(400, signal);
  }

  const error = new Error('cursor_deadline');

  error.name = 'TimeoutError';
  throw error;
}

async function callCursor(context, config, system) {
  const signal = AbortSignal.timeout(config.llmTimeoutMs);
  const headers = {
    authorization: `Bearer ${config.cursorApiKey}`,
    'content-type': 'application/json',
  };
  const body = {
    name: 'Yassir Next',
    prompt: {
      text: cursorPrompt(system, context, config.addressAs),
    },
  };

  if (config.cursorModel) body.model = { id: config.cursorModel };

  const created = await cursorJson('/v1/agents', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  }, config);
  const agentId = created.agent && created.agent.id;
  const runId = created.run && created.run.id;

  if (!agentId || !runId) {
    const error = new Error('cursor_empty_response');

    error.name = 'LlmHttpError';
    throw error;
  }

  try {
    const run = await pollRun(agentId, runId, headers, signal, config);

    if (run.status !== 'FINISHED' || !(run.result || '').trim()) {
      const error = new Error(`cursor_${String(run.status || 'empty').toLowerCase()}`);

      error.name = 'LlmHttpError';
      throw error;
    }

    return run.result;
  } finally {
    cleanupAgent(agentId, runId, headers, config).catch(() => {});
  }
}

module.exports = { callCursor };
