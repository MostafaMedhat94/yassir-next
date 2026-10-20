const { randomBytes } = require('crypto');
const { SERVICES } = require('../config/catalog');

const EXPIRES_MS = 2 * 60 * 60 * 1000;
const BLANK_TEXT = /^(n\/?a|none|null|undefined|\.{1,}|-+|"+|'+)$/i;

function visibleText(value) {
  const text = String(value == null ? '' : value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || BLANK_TEXT.test(text) || !/[\p{L}]/u.test(text)) return '';

  return text;
}

function buildPushData({ recommendationId, serviceId, cta, title, description, expiresAt }) {
  const service = SERVICES[serviceId];

  if (!service) {
    const error = new Error('unknown_service');

    error.code = 'unknown_service';

    throw error;
  }

  return {
    recommendation_id: recommendationId,
    service_id: service.service_id,
    service_name: service.service_name,
    title: visibleText(title) || `A suggestion from ${service.service_name}`,
    description: visibleText(description) || service.description,
    CTA: visibleText(cta) || `Open ${service.service_name}`,
    service_deep_link: service.service_deep_link,
    expires_at: String(expiresAt),
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

module.exports = { buildPushData, createRecommendation, visibleText };
