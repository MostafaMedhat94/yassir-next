const pino = require('pino');

function createLogger(bindings = {}) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'yassir-next', ...bindings },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

function childLogger(parent, bindings) {
  if (parent && typeof parent.child === 'function') return parent.child(bindings);
  if (parent && typeof parent.info === 'function' && typeof parent.warn === 'function') return parent;

  return createLogger(bindings);
}

module.exports = { childLogger, createLogger };
