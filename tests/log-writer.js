const assert = require('assert');
const { appendLineWithRetry } = require('../server/log-writer');

let caseCount = 0;

function test(name, fn) {
  try {
    fn();
    caseCount += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test('writes immediately when the file is available', () => {
  const writes = [];
  const result = appendLineWithRetry('control.log', 'line\n', {
    appendFileSync(filePath, line, encoding) {
      writes.push({ filePath, line, encoding });
    }
  });

  assert.deepStrictEqual(result, { ok: true, attempts: 1 });
  assert.deepStrictEqual(writes, [{ filePath: 'control.log', line: 'line\n', encoding: 'utf8' }]);
});

test('retries transient Windows file-lock errors and then succeeds', () => {
  let attempts = 0;
  const delays = [];

  const result = appendLineWithRetry('control.log', 'line\n', {
    maxAttempts: 4,
    retryDelayMs: 15,
    sleep(delayMs) {
      delays.push(delayMs);
    },
    appendFileSync() {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('resource busy or locked');
        error.code = 'EBUSY';
        throw error;
      }
    }
  });

  assert.deepStrictEqual(result, { ok: true, attempts: 3 });
  assert.deepStrictEqual(delays, [15, 30]);
});

test('does not retry non-transient errors', () => {
  let attempts = 0;
  const error = new Error('invalid path');
  error.code = 'EINVAL';

  const result = appendLineWithRetry('control.log', 'line\n', {
    maxAttempts: 5,
    sleep() {
      assert.fail('sleep must not run for a non-transient error');
    },
    appendFileSync() {
      attempts += 1;
      throw error;
    }
  });

  assert.strictEqual(attempts, 1);
  assert.deepStrictEqual(result, { ok: false, attempts: 1, error });
});

test('returns a compact failure result after transient retries are exhausted', () => {
  let attempts = 0;
  const delays = [];
  const error = new Error('resource busy or locked');
  error.code = 'EBUSY';

  const result = appendLineWithRetry('control.log', 'line\n', {
    maxAttempts: 3,
    retryDelayMs: 10,
    sleep(delayMs) {
      delays.push(delayMs);
    },
    appendFileSync() {
      attempts += 1;
      throw error;
    }
  });

  assert.strictEqual(attempts, 3);
  assert.deepStrictEqual(delays, [10, 20]);
  assert.deepStrictEqual(result, { ok: false, attempts: 3, error });
});

console.log(`Log writer tests passed: ${caseCount} cases`);
