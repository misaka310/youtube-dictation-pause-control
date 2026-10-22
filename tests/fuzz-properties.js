'use strict';

const assert = require('node:assert/strict');
const { appendLineWithRetry, formatLocalTimestamp } = require('../server/log-writer');

const codes = ['EBUSY', 'EACCES', 'EPERM', 'ENOENT'];
let cases = 0;

// Exhaustively cross retry budgets, transient/persistent failures and error codes.
for (let maxAttempts = 1; maxAttempts <= 8; maxAttempts += 1) {
  for (let failuresBeforeSuccess = 0; failuresBeforeSuccess <= 12; failuresBeforeSuccess += 1) {
    for (const [codeIndex, code] of codes.entries()) {
      const delay = (maxAttempts * 31 + failuresBeforeSuccess * 7 + codeIndex * 11) % 51;
      const sleeps = [];
      let calls = 0;
      const result = appendLineWithRetry('synthetic.log', 'synthetic\n', {
        maxAttempts,
        retryDelayMs: delay,
        sleep: (milliseconds) => sleeps.push(milliseconds),
        appendFileSync: () => {
          calls += 1;
          if (calls <= failuresBeforeSuccess) {
            const error = new Error('synthetic failure');
            error.code = code;
            throw error;
          }
        },
      });
      const retryable = code === 'EBUSY' || code === 'EACCES' || code === 'EPERM';
      const expectedAttempts = failuresBeforeSuccess === 0
        ? 1
        : retryable ? Math.min(failuresBeforeSuccess + 1, maxAttempts) : 1;
      const expectedSuccess = failuresBeforeSuccess === 0
        || (retryable && failuresBeforeSuccess < maxAttempts);
      assert.equal(result.attempts, expectedAttempts, 'attempt count');
      assert.equal(result.ok, expectedSuccess, 'success status');
      assert.equal(calls, expectedAttempts, 'writer invocations');
      assert.deepEqual(
        sleeps,
        Array.from({ length: retryable ? expectedAttempts - 1 : 0 }, (_, index) => delay * (index + 1)),
        'bounded linear backoff',
      );
      cases += 1;
    }
  }
}

// Date formatting invariant across years, calendar months and daylight changes.
for (const year of [1970, 1999, 2000, 2026, 2099, 2200, 9999]) {
  for (let month = 0; month < 12; month += 1) {
    for (const day of [1, 14, 28]) {
      for (const hour of [0, 12, 23]) {
        const value = new Date(year, month, day, hour, 17, 39);
        const formatted = formatLocalTimestamp(value);
        assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/);
        const pad = (part) => String(part).padStart(2, '0');
        const expectedDate = String(value.getFullYear()) + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate());
        assert.equal(formatted.slice(0, 10), expectedDate);
        cases += 1;
      }
    }
  }
}

console.log('Deterministic fuzz/property tests: ' + cases + ' PASS');
