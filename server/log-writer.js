const fs = require('fs');

const RETRYABLE_ERROR_CODES = new Set(['EBUSY', 'EACCES', 'EPERM']);
const waitArray = new Int32Array(new SharedArrayBuffer(4));

function defaultSleep(delayMs) {
  Atomics.wait(waitArray, 0, 0, delayMs);
}

function appendLineWithRetry(filePath, line, options = {}) {
  const appendFileSync = options.appendFileSync || fs.appendFileSync;
  const sleep = options.sleep || defaultSleep;
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
    ? options.maxAttempts
    : 5;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0
    ? options.retryDelayMs
    : 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      appendFileSync(filePath, line, 'utf8');
      return { ok: true, attempts: attempt };
    } catch (error) {
      const retryable = RETRYABLE_ERROR_CODES.has(error?.code);
      if (!retryable || attempt === maxAttempts) {
        return { ok: false, attempts: attempt, error };
      }

      sleep(retryDelayMs * attempt);
    }
  }

  return {
    ok: false,
    attempts: maxAttempts,
    error: new Error('Log write retry loop ended unexpectedly')
  };
}

module.exports = {
  appendLineWithRetry
};
