// tiny in-process event bus. lets modules talk without importing
// each other. only real cross-module coupling in the project. if we
// ever split modules into separate services this gets swapped for
// redis pub/sub or sqs.

const handlers = new Map();

export function onReportingEvent(event, fn) { add(`reporting:${event}`, fn); }
export function onDispatchEvent(event, fn)  { add(`dispatch:${event}`, fn); }
export function onAnalyticsEvent(event, fn) { add(`analytics:${event}`, fn); }

export function emitReportingEvent(event, payload) { fire(`reporting:${event}`, payload); }
export function emitDispatchEvent(event, payload)  { fire(`dispatch:${event}`, payload); }
export function emitAnalyticsEvent(event, payload) { fire(`analytics:${event}`, payload); }

function add(key, fn) {
  if (!handlers.has(key)) handlers.set(key, []);
  handlers.get(key).push(fn);
}

function fire(key, payload) {
  const list = handlers.get(key) || [];
  for (const fn of list) {
    try { fn(payload); } catch (e) { console.error(`[events] ${key} handler failed`, e); }
  }
}
