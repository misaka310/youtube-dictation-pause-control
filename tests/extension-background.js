const assert = require('assert');
const { createStateResponder } = require('../extension/background.js');

async function expectResponse(fetchFn, expected) {
  const getState = createStateResponder({ fetch: fetchFn, timeoutMs: 5, console: { log() {}, error() {} } });
  assert.deepStrictEqual(await getState(), expected);
}

async function main() {
  await expectResponse(
    async () => ({ ok: true, json: async () => ({ active: true, sessionId: 3 }) }),
    { success: true, data: { active: true, sessionId: 3 } }
  );

  await expectResponse(
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    { success: false, error: 'HTTP error! status: 503' }
  );

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

  console.log('Extension background test passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
