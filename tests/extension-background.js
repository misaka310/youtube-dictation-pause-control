const assert = require('assert');
const { createStateResponder, createMessageListener } = require('../extension/background.js');

async function expectResponse(fetchFn, expected) {
  const getState = createStateResponder({ fetch: fetchFn, timeoutMs: 5, console: { log() {}, error() {} } });
  assert.deepStrictEqual(await getState(), expected);
}

async function main() {
  await expectResponse(
    async () => ({ ok: true, json: async () => ({ active: true, sessionId: 3 }) }),
    { success: true, data: { active: true, sessionId: 3 } }
  );

  for (const status of [400, 404, 500, 503]) {
    await expectResponse(
      async () => ({ ok: false, status, json: async () => ({}) }),
      { success: false, error: `HTTP error! status: ${status}` }
    );
  }

  await expectResponse(
    async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }),
    { success: false, error: 'Unexpected token' }
  );

  await expectResponse(
    async () => { throw new Error('network unavailable'); },
    { success: false, error: 'network unavailable' }
  );

  class TestAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  const timeoutResponder = createStateResponder({
    fetch: (_url, options) => new Promise((_, reject) => setTimeout(() => {
      if (options.signal.aborted) reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, 10)),
    AbortController: TestAbortController,
    timeoutMs: 1,
    console: { log() {}, error() {} }
  });
  assert.deepStrictEqual(await timeoutResponder(), { success: false, error: 'Fetch timeout (1ms)' });

  const listenerResponse = await new Promise(resolve => {
    const listener = createMessageListener({
      getState: async () => ({ success: true, data: { active: true, sessionId: 4 } }),
      console: { error() {} }
    });
    assert.strictEqual(listener({ type: 'GET_STATE' }, {}, resolve), true);
  });
  assert.deepStrictEqual(listenerResponse, { success: true, data: { active: true, sessionId: 4 } });

  let getStateCalled = false;
  let sendResponseCalled = false;
  const unrelatedListener = createMessageListener({
    getState: () => { getStateCalled = true; },
    console: { error() {} }
  });
  assert.strictEqual(unrelatedListener({ type: 'OTHER' }, {}, () => { sendResponseCalled = true; }), undefined);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(getStateCalled, false);
  assert.strictEqual(sendResponseCalled, false);

  const rejectedResponse = await new Promise(resolve => {
    const listener = createMessageListener({
      getState: () => Promise.reject(new Error('state unavailable')),
      console: { error() {} }
    });
    assert.strictEqual(listener({ type: 'GET_STATE' }, {}, resolve), true);
  });
  assert.deepStrictEqual(rejectedResponse, { success: false, error: 'state unavailable' });

  console.log('Extension background test passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
