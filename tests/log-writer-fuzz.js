'use strict';

const assert = require('assert');
const fc = require('fast-check');
const { appendLineWithRetry } = require('../server/log-writer');

fc.assert(
  fc.property(
    fc.integer({ min: 1, max: 8 }),
    fc.integer({ min: 0, max: 12 }),
    fc.integer({ min: 0, max: 50 }),
    fc.constantFrom('EBUSY', 'EACCES', 'EPERM', 'ENOENT'),
    fc.string({ maxLength: 80 }),
    (maxAttempts, failuresBeforeSuccess, retryDelayMs, code, line) => {
      let calls = 0;
      const sleeps = [];
      const result = appendLineWithRetry('ignored.log', line, {
        maxAttempts,
        retryDelayMs,
        sleep: (delay) => sleeps.push(delay),
        appendFileSync: () => {
          calls += 1;
          if (calls <= failuresBeforeSuccess) {
            const error = new Error('synthetic write failure');
            error.code = code;
            throw error;
          }
        },
      });

      const retryable = code === 'EBUSY' || code === 'EACCES' || code === 'EPERM';
      const expectedAttempts = failuresBeforeSuccess === 0
        ? 1
        : retryable
          ? Math.min(failuresBeforeSuccess + 1, maxAttempts)
          : 1;
      const expectedOk = failuresBeforeSuccess === 0 || (retryable && failuresBeforeSuccess < maxAttempts);

      assert.equal(result.attempts, expectedAttempts);
      assert.equal(result.ok, expectedOk);
      assert.equal(calls, expectedAttempts);
      assert.deepEqual(
        sleeps,
        Array.from({ length: expectedOk ? expectedAttempts - 1 : retryable ? Math.max(0, expectedAttempts - 1) : 0 }, (_, index) => retryDelayMs * (index + 1)),
      );
    },
  ),
  { numRuns: 500 },
);

console.log('log writer property fuzzing: PASS');
