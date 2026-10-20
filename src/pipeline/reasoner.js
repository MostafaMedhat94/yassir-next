const { z } = require('zod');
const { loadConfig } = require('../config');
const { SERVICES, SERVICE_IDS } = require('../config/catalog');
const { visibleText } = require('./deliver');

const decisionSchema = z.object({
  should_notify: z.boolean(),
  service_id: z.enum(SERVICE_IDS),
  title: z.string().max(80),
  description: z.string().max(180),
  cta: z.string().max(180),
  reason: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
}).superRefine((decision, context) => {
  if (!decision.should_notify) return;

  for (const field of ['title', 'description', 'cta']) {
    if (!(decision[field] || '').trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required when should_notify is true`,
      });
    }
  }
});

const responseSchema = {
  type: 'object',
  properties: {
    should_notify: { type: 'boolean' },
    service_id: { type: 'string', enum: SERVICE_IDS },
    title: { type: 'string', description: 'Short personal headline, under 60 characters.' },
    description: { type: 'string', description: 'One sentence of the benefit, under 140 characters.' },
    cta: { type: 'string', description: 'Button label, under 90 characters.' },
    reason: { type: 'string', description: 'One sentence explaining the choice.' },
    confidence: { type: 'number' },
  },
  required: ['should_notify', 'service_id', 'title', 'description', 'cta', 'reason', 'confidence'],
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
    'food and grocery are both Yassir Express. Choose them only when the persona is about meals or groceries.',
    'Choose pay for fares, receipts, bill splitting, or expenses. Choose go only when go is unused and the persona is about getting somewhere.',
    'When the trigger is persona_registered, there is no live trip. Use the persona, the behavior, and the unused services.',
    'If no catalog service genuinely fits, return should_notify false instead of forcing a cross-sell. Still return a non-empty title, description, and cta.',
    'title is a short headline under 60 characters. Address the person by the first name in full_name, in the shape of "Returning home late, {first name}?" Never use any other person\'s name.',
    'description is one sentence under 140 characters that states the benefit, in the shape of "Share your live trip and route with trusted contacts for extra peace of mind."',
    'cta is the button label, under 90 characters. Avoid discounts, urgency spam, and exclamation marks.',
    'reason is one sentence a reviewer can read. Do not invent services or URLs.',
    '',
    'Catalog:',
    catalogLines(),
  ].join('\n');
}

function personaCopy(name, serviceId) {
  const copies = {
    food: {
      title: `Hungry after the day, ${name}?`,
      description: 'A meal can be ready without adding another stop.',
      cta: 'Order food with Yassir Express',
    },
    grocery: {
      title: `Need anything at home, ${name}?`,
      description: 'Groceries can arrive without an extra trip out.',
      cta: 'Order groceries with Yassir Express',
    },
    pay: {
      title: `Settling the rest, ${name}?`,
      description: 'Yassir Pay can cover what the ride does not.',
      cta: 'Open Yassir Pay',
    },
    go: {
      title: `Going somewhere, ${name}?`,
      description: 'A ride can be ready when you are.',
      cta: 'Book a ride with Yassir Go',
    },
  };

  return copies[serviceId] || copies.food;
}

function templateCopy(context) {
  const name = context.persona.full_name || 'there';
  const rainy = context.weather && (context.weather.condition === 'rain' || context.weather.condition === 'storm');

  if (context.trigger.id === 'persona_registered') {
    return personaCopy(name, context.trigger.likely_service);
  }

  if (context.trigger.id === 'heading_home_meal' && context.trigger.meal === 'lunch') {
    return {
      title: `Heading home for lunch, ${name}?`,
      description: 'Lunch can be at your door when you arrive.',
      cta: 'Heading home? Lunch can be at your door when you arrive.',
    };
  }

  if (context.trigger.id === 'heading_home_meal' && rainy) {
    return {
      title: `Heading home in the rain, ${name}?`,
      description: 'Dinner can meet you at the door.',
      cta: 'Heading home in the rain? Dinner can meet you at the door.',
    };
  }

  if (context.trigger.id === 'heading_home_meal') {
    return {
      title: `Heading home, ${name}?`,
      description: 'Dinner can be at your door when you arrive.',
      cta: 'Heading home? Dinner can be at your door when you arrive.',
    };
  }

  if (context.trigger.id === 'airport_arrival') {
    return {
      title: `Just arrived, ${name}?`,
      description: 'Yassir Pay can cover the rest of the trip.',
      cta: 'Just arrived? Yassir Pay can cover the rest of the trip.',
    };
  }

  if (context.trigger.id === 'late_night_completed') {
    return {
      title: `Out late, ${name}?`,
      description: 'Food can be waiting when this ride ends.',
      cta: 'Out late? Food can be waiting when this ride ends.',
    };
  }

  return {
    title: `Free morning, ${name}?`,
    description: 'Groceries can be at your door today.',
    cta: 'Free morning? Groceries can be at your door today.',
  };
}

function templateDecision(context, source) {
  const unused = context.unused_services.join(', ') || 'none';

  return {
    decision: {
      should_notify: true,
      service_id: context.trigger.likely_service,
      ...templateCopy(context),
      reason: `Template fallback (${source}). ${context.persona.name}, ${context.trigger.id}, unused: ${unused}.`,
      confidence: 0.7,
    },
    source,
  };
}

function firstNameOf(fullName) {
  const name = String(fullName || '').trim().split(/\s+/)[0];

  return name || '';
}

function bindPersonName(text, fullName) {
  const name = firstNameOf(fullName);

  if (!name || !text) return text;

  return text.replace(/,\s*([\p{Lu}][\p{L}'’-]+)\s*([?.!])/gu, (match, spoken, punct) => (
    spoken.toLowerCase() === name.toLowerCase() ? match : `, ${name}${punct}`
  ));
}

function bindDecision(decision, context) {
  const fullName = context.persona && context.persona.full_name;

  return {
    ...decision,
    title: bindPersonName(decision.title, fullName),
    description: bindPersonName(decision.description, fullName),
    cta: bindPersonName(decision.cta, fullName),
  };
}

function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('llm_deadline');

      error.name = 'TimeoutError';
      reject(error);
    }, ms);
  });

  return Promise.race([promise, deadline]).finally(() => {
    clearTimeout(timer);
  });
}

function filledDecision(decision, context) {
  const trigger = context.trigger || { id: 'persona_registered', likely_service: 'food' };
  const serviceId = SERVICES[decision.service_id] ? decision.service_id : trigger.likely_service;
  const copy = templateCopy({
    ...context,
    trigger: { ...trigger, likely_service: serviceId },
  });
  const title = visibleText(decision.title);
  const description = visibleText(decision.description);
  const cta = visibleText(decision.cta);

  return {
    ...decision,
    service_id: serviceId,
    title: title || copy.title,
    description: description || copy.description,
    cta: cta || copy.cta,
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
      contents: [{
        role: 'user',
        parts: [{
          text: `Address this person as ${firstNameOf(context.persona && context.persona.full_name) || 'them'} and nobody else.\n${JSON.stringify(context)}`,
        }],
      }],
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
    const text = await withDeadline(callModel(context, config), config.llmTimeoutMs);
    const decision = parseDecision(text);

    if (!decision) return templateDecision(context, 'invalid_output');

    return { decision: bindDecision(decision, context), source: 'model' };
  } catch (error) {
    if (config.logger) {
      config.logger.warn({ message: error.message }, 'reasoner fallback');
    }

    return templateDecision(context, fallbackSource(error));
  }
}

module.exports = {
  filledDecision,
  reasonAboutContext,
  templateCopy,
};
