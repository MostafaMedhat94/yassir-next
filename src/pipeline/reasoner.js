const { z } = require('zod');
const { loadConfig } = require('../config');
const { SERVICES, SERVICE_IDS } = require('../config/catalog');

const decisionSchema = z.object({
  should_notify: z.boolean(),
  service_id: z.enum(SERVICE_IDS),
  cta: z.string().max(180),
  reason: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
}).superRefine((decision, context) => {
  if (decision.should_notify && decision.cta.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cta'],
      message: 'cta is required when should_notify is true',
    });
  }
});

const responseSchema = {
  type: 'object',
  properties: {
    should_notify: { type: 'boolean' },
    service_id: { type: 'string', enum: SERVICE_IDS },
    cta: { type: 'string', description: 'Under 90 characters. Mention the concrete context.' },
    reason: { type: 'string', description: 'One sentence explaining the choice.' },
    confidence: { type: 'number' },
  },
  required: ['should_notify', 'service_id', 'cta', 'reason', 'confidence'],
};

function thinkingConfigFor(model) {
  if (model.startsWith('gemini-2.5')) return { thinkingBudget: 0 };

  if (model.includes('3.8') || model.startsWith('gemini-4')) return { thinkingLevel: 'low' };

  return { thinkingLevel: 'minimal' };
}

function catalogLines() {
  return SERVICE_IDS.map((serviceId) => {
    const service = SERVICES[serviceId];

    return `- ${serviceId}: ${service.service_name}. ${service.description}`;
  }).join('\n');
}

function systemPrompt() {
  return [
    'You are the Yassir Next recommendation reasoner.',
    'Choose at most one service from the catalog. Return should_notify false when the moment is a poor fit.',
    'The trigger likely_service is a hint, not an order. Prefer an unused service that fits the persona and the moment.',
    'If no catalog service genuinely fits, return should_notify false instead of forcing a cross-sell.',
    'cta must be under 90 characters, mention the concrete context, and avoid discounts, urgency spam, and exclamation marks.',
    'reason is one sentence a reviewer can read. Do not invent services or URLs.',
    '',
    'Catalog:',
    catalogLines(),
  ].join('\n');
}

function templateCta(context) {
  const rainy = context.weather && (context.weather.condition === 'rain' || context.weather.condition === 'storm');

  if (context.trigger.id === 'heading_home_meal' && context.trigger.meal === 'lunch') {
    return 'Heading home? Lunch can be at your door when you arrive.';
  }

  if (context.trigger.id === 'heading_home_meal' && rainy) {
    return 'Heading home in the rain? Dinner can meet you at the door.';
  }

  if (context.trigger.id === 'heading_home_meal') {
    return 'Heading home? Dinner can be at your door when you arrive.';
  }

  if (context.trigger.id === 'airport_arrival') {
    return 'Just arrived? Yassir Pay can cover the rest of the trip.';
  }

  if (context.trigger.id === 'late_night_completed') {
    return 'Out late? Food can be waiting when this ride ends.';
  }

  return 'Free morning? Groceries can be at your door today.';
}

function templateDecision(context, source) {
  const unused = context.unused_services.join(', ') || 'none';

  return {
    decision: {
      should_notify: true,
      service_id: context.trigger.likely_service,
      cta: templateCta(context),
      reason: `Template fallback (${source}). ${context.persona.name}, ${context.trigger.id}, unused: ${unused}.`,
      confidence: 0.7,
    },
    source,
  };
}

function extractText(body) {
  const parts = body && body.candidates && body.candidates[0]
    && body.candidates[0].content
    && body.candidates[0].content.parts;

  if (!parts) return '';

  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim();
}

function parseDecision(text) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();

  try {
    const parsed = decisionSchema.safeParse(JSON.parse(cleaned));

    return parsed.success ? parsed.data : null;
  } catch (_error) {
    return null;
  }
}

async function callModel(context, config) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.llmModel)}:generateContent`;
  const response = await config.fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': config.llmApiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
        responseSchema,
        thinkingConfig: thinkingConfigFor(config.llmModel),
      },
    }),
    signal: AbortSignal.timeout(config.llmTimeoutMs),
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 180);
    const error = new Error(`llm_http_${response.status}: ${detail}`);

    error.name = 'LlmHttpError';
    throw error;
  }

  const text = extractText(await response.json());

  if (!text) {
    const error = new Error('llm_empty_response');

    error.name = 'LlmHttpError';
    throw error;
  }

  return text;
}

function fallbackSource(error) {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';

  return 'request_failed';
}

async function reasonAboutContext(context, options = {}) {
  const config = {
    ...loadConfig(),
    fetchImpl: fetch,
    ...options,
  };

  if (!config.llmApiKey) return templateDecision(context, 'missing_api_key');

  try {
    const text = await callModel(context, config);
    const decision = parseDecision(text);

    if (!decision) return templateDecision(context, 'invalid_output');

    return { decision, source: 'model' };
  } catch (error) {
    if (config.logger) {
      config.logger.warn({ message: error.message }, 'reasoner fallback');
    }

    return templateDecision(context, fallbackSource(error));
  }
}

module.exports = {
  reasonAboutContext,
  templateCta,
};
