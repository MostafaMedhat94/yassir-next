const { randomBytes } = require('crypto');
const { SERVICES } = require('../config/catalog');

const EXPIRES_MS = 2 * 60 * 60 * 1000;

function buildPushData({ recommendationId, serviceId, cta, title, description, expiresAt }) {
  const service = SERVICES[serviceId];

  return {
    recommendation_id: recommendationId,
    service_id: service.service_id,
    service_name: service.service_name,
    title,
    description,
    CTA: cta,
    service_deep_link: service.service_deep_link,
    expires_at: expiresAt,
  };
}

function createRecommendation({ serviceId, cta, title, description, fromTs }) {
  const fromMs = new Date(fromTs).getTime();

  return buildPushData({
    recommendationId: `rec_${randomBytes(4).toString('hex')}`,
    serviceId,
    cta,
    title,
    description,
    expiresAt: new Date(fromMs + EXPIRES_MS).toISOString(),
  });
}

module.exports = { buildPushData, createRecommendation };
