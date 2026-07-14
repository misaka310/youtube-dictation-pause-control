const assert = require('assert');
const { createStateResponder, createMessageListener } = require('../extension/background.js');

const quietLogger = { log() {}, error() {} };
const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}

function createResponder(fetchFn, options = {}) {
  return createStateResponder({
    fetch: fetchFn,
    AbortController: options.AbortController,
    timeoutMs: options.timeoutMs || 20,
    console: options.console || quietLogger
  });
}

async function invokeListener(getState, options = {}) {
  const listener = createMessageListener({ getState, console: options.console || quietLogger });
  let returnValue;
  const response = await new Promise(resolve => {
    returnValue = listener(options.message || { type: 'GET_STATE' }, {}, options.sendResponse || resolve);
  });
  return { returnValue, response };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

async function assertNoUnhandledRejection(run) {
  let unhandled = null;
  const handler = error => { unhandled = error; };
  process.on('unhandledRejection', handler);
  try {
    await run();
    await flushPromises();
    assert.strictEqual(unhandled, null);
  } finally {
    process.removeListener('unhandledRejection', handler);
  }
}

test('normal GET_STATE uses the production listener boundary', async () => {
  const getState = createResponder(async () => ({
    ok: true,
    json: async () => ({ active: true, sessionId: 3 })
  }));
  const result = await invokeListener(getState);
  assert.strictEqual(result.returnValue, true);
  assert.deepStrictEqual(result.response, { success: true, data: { active: true, sessionId: 3 } });
});

test('GET_STATE listener returns true immediately', async () => {
  let resolveState;
  const getState = () => new Promise(resolve => { resolveState = resolve; });
  const listener = createMessageListener({ getState, console: quietLogger });
  let response = null;
  const returnValue = listener({ type: 'GET_STATE' }, {}, payload => { response = payload; });
  assert.strictEqual(returnValue, true);
  assert.strictEqual(response, null);
  await Promise.resolve();
  assert.strictEqual(typeof resolveState, 'function');
  resolveState({ success: true, data: { active: false, sessionId: 0 } });
  await flushPromises();
  assert.deepStrictEqual(response, { success: true, data: { active: false, sessionId: 0 } });
});

test('GET_STATE sends the success response asynchronously', async () => {
  let synchronous = true;
  let calledSynchronously = null;
  const listener = createMessageListener({
    getState: () => ({ success: true, data: { active: true, sessionId: 4 } }),
    console: quietLogger
  });
  const responsePromise = new Promise(resolve => {
    listener({ type: 'GET_STATE' }, {}, payload => {
      calledSynchronously = synchronous;
      resolve(payload);
    });
  });
  synchronous = false;
  const response = await responsePromise;
  assert.strictEqual(calledSynchronously, false);
  assert.deepStrictEqual(response, { success: true, data: { active: true, sessionId: 4 } });
});

for (const status of [400, 404, 500, 503]) {
  test(`HTTP ${status} returns a protected failure response`, async () => {
    const getState = createResponder(async () => ({ ok: false, status, json: async () => ({}) }));
    const result = await invokeListener(getState);
    assert.strictEqual(result.returnValue, true);
    assert.deepStrictEqual(result.response, { success: false, error: `HTTP error! status: ${status}` });
  });
}

test('fetch exception returns a protected failure response', async () => {
  const getState = createResponder(async () => { throw new Error('network unavailable'); });
  const result = await invokeListener(getState);
  assert.deepStrictEqual(result.response, { success: false, error: 'network unavailable' });
});

test('fetch timeout returns a protected failure response', async () => {
  class TestAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  const getState = createResponder(
    (_url, options) => new Promise((_, reject) => setTimeout(() => {
      if (options.signal.aborted) {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }
    }, 10)),
    { AbortController: TestAbortController, timeoutMs: 1 }
  );
  const result = await invokeListener(getState);
  assert.deepStrictEqual(result.response, { success: false, error: 'Fetch timeout (1ms)' });
});

test('invalid JSON returns a protected failure response', async () => {
  const getState = createResponder(async () => ({
    ok: true,
    json: async () => { throw new SyntaxError('Unexpected token'); }
  }));
  const result = await invokeListener(getState);
  assert.deepStrictEqual(result.response, { success: false, error: 'Unexpected token' });
});

test('messages other than GET_STATE are ignored', async () => {
  let getStateCalled = false;
  let sendResponseCalled = false;
  const listener = createMessageListener({
    getState: () => { getStateCalled = true; },
    console: quietLogger
  });
  const result = listener({ type: 'OTHER' }, {}, () => { sendResponseCalled = true; });
  await flushPromises();
  assert.strictEqual(result, undefined);
  assert.strictEqual(getStateCalled, false);
  assert.strictEqual(sendResponseCalled, false);
});

test('unrelated messages never call fetch', async () => {
  let fetchCalled = false;
  const getState = createResponder(async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ active: false, sessionId: 0 }) };
  });
  const listener = createMessageListener({ getState, console: quietLogger });
  assert.strictEqual(listener(null, {}, () => {}), undefined);
  assert.strictEqual(listener({ value: 'unrelated' }, {}, () => {}), undefined);
  await flushPromises();
  assert.strictEqual(fetchCalled, false);
});

test('getState rejection returns a failure response', async () => {
  const result = await invokeListener(() => Promise.reject(new Error('state unavailable')));
  assert.strictEqual(result.returnValue, true);
  assert.deepStrictEqual(result.response, { success: false, error: 'state unavailable' });
});

test('sendResponse exception on success is swallowed without retry or unhandled rejection', async () => {
  let sendCalls = 0;
  const errors = [];
  await assertNoUnhandledRejection(async () => {
    const listener = createMessageListener({
      getState: () => Promise.resolve({ success: true, data: { active: true, sessionId: 5 } }),
      console: { log() {}, error: (...args) => errors.push(args.join(' ')) }
    });
    assert.strictEqual(listener({ type: 'GET_STATE' }, {}, () => {
      sendCalls += 1;
      throw new Error('port closed');
    }), true);
  });
  assert.strictEqual(sendCalls, 1);
  assert.ok(errors.some(message => message.includes('sendResponse failed')));
});

test('sendResponse exception on failure is swallowed without retry or unhandled rejection', async () => {
  let sendCalls = 0;
  const errors = [];
  await assertNoUnhandledRejection(async () => {
    const listener = createMessageListener({
      getState: () => Promise.reject(new Error('state unavailable')),
      console: { log() {}, error: (...args) => errors.push(args.join(' ')) }
    });
    assert.strictEqual(listener({ type: 'GET_STATE' }, {}, () => {
      sendCalls += 1;
      throw new Error('port closed');
    }), true);
  });
  assert.strictEqual(sendCalls, 1);
  assert.ok(errors.some(message => message.includes('state request failed')));
  assert.ok(errors.some(message => message.includes('sendResponse failed')));
});

async function main() {
  let passed = 0;
  for (const entry of cases) {
    try {
      await entry.fn();
      passed += 1;
    } catch (error) {
      error.message = `${entry.name}: ${error.message}`;
      throw error;
    }
  }
  console.log(`Background Worker tests passed: ${passed} cases`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
