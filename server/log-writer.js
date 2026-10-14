const fs = require('fs');

const RETRYABLE_ERROR_CODES = new Set(['EBUSY', 'EACCES', 'EPERM']);
const waitArray = new Int32Array(new SharedArrayBuffer(4));

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalTimestamp(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);

  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
    `${offsetSign}${pad2(Math.floor(absoluteOffset / 60))}:${pad2(absoluteOffset % 60)}`
  ].join(' ');
}

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
  appendLineWithRetry,
  formatLocalTimestamp
};
