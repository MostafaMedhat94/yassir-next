const { z } = require('zod');
const { SERVICE_IDS } = require('./config/catalog');
const { demoUserId } = require('./config/persona-presets');

const serviceIdSchema = z.enum(SERVICE_IDS);

const personaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  subtitle: z.string().min(1),
  profile: z.object({
    fullName: z.string().min(1),
    age: z.number().int().positive(),
    occupation: z.string().min(1),
    usageFrequency: z.string().min(1),
  }),
  context: z.string().min(1),
  behavior: z.array(z.string().min(1)).min(1),
  keyPainPoints: z.array(z.string().min(1)).min(1),
  primaryMotivation: z.string().min(1),
});

const usageSchema = z.object({
  go: z.number().int().nonnegative(),
  food: z.number().int().nonnegative(),
  grocery: z.number().int().nonnegative(),
  pay: z.number().int().nonnegative(),
});

const userBodySchema = z.object({
  user_id: z.string().min(1),
  fcm_token: z.string().min(1),
  persona: personaSchema,
  usage: usageSchema.optional(),
});

const coordinatesSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

const destinationSchema = z.enum(['home', 'work', 'airport', 'other']);

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    event_id: z.string().uuid(),
    type: z.literal('app_opened'),
    ts: z.string().datetime({ offset: true }),
    props: coordinatesSchema,
  }),
  z.object({
    event_id: z.string().uuid(),
    type: z.literal('trip_started'),
    ts: z.string().datetime({ offset: true }),
    props: coordinatesSchema.extend({
      destination_label: destinationSchema,
      eta_min: z.number().int().positive(),
    }),
  }),
  z.object({
    event_id: z.string().uuid(),
    type: z.literal('trip_completed'),
    ts: z.string().datetime({ offset: true }),
    props: coordinatesSchema.extend({
      destination_label: destinationSchema,
    }),
  }),
  z.object({
    event_id: z.string().uuid(),
    type: z.literal('service_used'),
    ts: z.string().datetime({ offset: true }),
    props: z.object({
      service_id: serviceIdSchema,
    }),
  }),
  z.object({
    event_id: z.string().uuid(),
    type: z.literal('recommendation_shown'),
    ts: z.string().datetime({ offset: true }),
    props: z.object({ recommendation_id: z.string().min(1) }),
  }),
  z.object({
    event_id: z.string().uuid(),
    type: z.literal('recommendation_opened'),
    ts: z.string().datetime({ offset: true }),
    props: z.object({ recommendation_id: z.string().min(1) }),
  }),
  z.object({
    event_id: z.string().uuid(),
    type: z.literal('recommendation_dismissed'),
    ts: z.string().datetime({ offset: true }),
    props: z.object({ recommendation_id: z.string().min(1) }),
  }),
]);

const eventsBodySchema = z.object({
  user_id: z.string().min(1),
  events: z.array(eventSchema).min(1).max(50),
});

const debugPushBodySchema = z
  .object({
    user_id: z.string().min(1),
    service_id: serviceIdSchema.optional(),
    CTA: z.string().min(1).max(180).optional(),
    title: z.string().min(1).max(80).optional(),
    description: z.string().min(1).max(180).optional(),
    data: z.record(z.string(), z.string()).optional(),
  })
  .refine((body) => body.data || body.service_id, {
    message: 'service_id or data is required',
  });

function parseRegistration(body, fcmToken) {
  if (body && typeof body === 'object' && body.persona) {
    const wrapped = userBodySchema.safeParse(body);

    if (!wrapped.success) return { ok: false, error: wrapped.error };

    return { ok: true, data: wrapped.data };
  }

  const persona = personaSchema.safeParse(body);

  if (!persona.success) return { ok: false, error: persona.error };
  if (!fcmToken) return { ok: false, missingToken: true };

  return {
    ok: true,
    data: {
      user_id: demoUserId(persona.data),
      fcm_token: fcmToken,
      persona: persona.data,
    },
  };
}

function validationError(error) {
  return {
    error: 'invalid_body',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

module.exports = {
  userBodySchema,
  eventsBodySchema,
  debugPushBodySchema,
  parseRegistration,
  validationError,
};
