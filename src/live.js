const { EventEmitter } = require('events');

function createLiveBus() {
  const emitter = new EventEmitter();
  let latest = null;

  emitter.setMaxListeners(0);

  return {
    publish(event) {
      if (event.type === 'run' && (event.stage === 'delivery' || event.stage === 'decision')) {
        latest = event;
      }

      emitter.emit('event', event);
    },

    latest() {
      return latest;
    },

    subscribe(listener) {
      emitter.on('event', listener);

      return () => emitter.off('event', listener);
    },
  };
}

module.exports = { createLiveBus };
