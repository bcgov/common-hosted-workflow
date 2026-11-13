'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.callWebhook = callWebhook;
const errors_1 = require('../../utils/errors');
/**
 * Calls an external webhook URL and returns the raw Response.
 * Translates timeout errors to 504 and network errors to 502 AppErrors,
 * using the caller-supplied messages so each context can give a meaningful description.
 */
async function callWebhook({ url, method, body, timeoutMs, timeoutMessage, unreachableMessage, headers }) {
  try {
    return await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new errors_1.AppError(504, timeoutMessage);
    }
    throw new errors_1.AppError(502, unreachableMessage);
  }
}
