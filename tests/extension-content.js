const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createPauseController } = require('../extension/content.js');

class FakeVideo {
  constructor({ paused = false, readyState = 4, playError = null } = {}) {
    this.paused = paused;
    this.ended = false;
    this.readyState = readyState;
    this.playError = playError;
    this.pauseCalls = 0;
    this.playCalls = 0;
    this.listeners = new Map();
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  pause() { this.pauseCalls += 1; this.paused = true; }
  play() {
    this.playCalls += 1;
    if (this.playError) return Promise.reject(this.playError);
    this.paused = false;
    const listener = this.listeners.get('play');
    if (listener) listener({ target: this });
    return Promise.resolve();
  }
  userPlay() {
    this.paused = false;
    const listener = this.listeners.get('play');
    if (listener) listener({ target: this });
  }
}

function createHarness(states = [], initialVideo = new FakeVideo(), options = {}) {
  let video = initialVideo;
  let requestCount = 0;
  const logs = [];
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        requestCount += 1;
        if (options.sendMessage) return options.sendMessage(message, callback, chrome.runtime);
        const next = states.shift();
        callback(next && Object.prototype.hasOwnProperty.call(next, '__raw')
          ? next.__raw
          : { success: true, data: next });
      }
    }
  };
  const controller = createPauseController({
    window: {},
    document: { querySelector: () => video },
    chrome,
    console: {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push(args.join(' '))
    },
    requestTimeoutMs: options.requestTimeoutMs,
    setTimeout: options.setTimeout,
    clearTimeout: options.clearTimeout
  });
  return {
    controller,
    logs,
    getRequestCount: () => requestCount,
    setVideo: nextVideo => { video = nextVideo; }
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

async function poll(controller) {
  await controller.pollState();
  await flushPromises();
}

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}

test('inactive -> active pauses once and records the session', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([{ active: true, sessionId: 1 }], video);
  await poll(controller);
  assert.strictEqual(video.pauseCalls, 1);
  assert.strictEqual(controller.getState().pausedSessionId, 1);
  assert.strictEqual(controller.getState().isPausedByMe, true);
});

test('active -> inactive resumes only the video owned by the same session', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([{ active: true, sessionId: 3 }, { active: false, sessionId: 3 }], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(video.playCalls, 1);
  assert.strictEqual(controller.getState().isPausedByMe, false);
});

test('initial inactive never resumes a user-paused video', async () => {
  const video = new FakeVideo({ paused: true });
  const { controller } = createHarness([{ active: false, sessionId: 0 }], video);
  await poll(controller);
  assert.strictEqual(video.playCalls, 0);
});

test('active -> active is idempotent while the video remains paused', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([{ active: true, sessionId: 5 }, { active: true, sessionId: 5 }], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(video.pauseCalls, 1);
});

test('Pause Guard blocks playback during the active owned session', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([{ active: true, sessionId: 6 }], video);
  await poll(controller);
  video.userPlay();
  assert.strictEqual(video.paused, true);
  assert.strictEqual(video.pauseCalls, 2);
});

test('successive sessions pause and resume independently', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 7 }, { active: false, sessionId: 7 },
    { active: true, sessionId: 8 }, { active: false, sessionId: 8 }
  ], video);
  await poll(controller);
  await poll(controller);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(video.pauseCalls, 2);
  assert.strictEqual(video.playCalls, 2);
});

test('SPA video replacement is attached and paused while dictation remains active', async () => {
  const firstVideo = new FakeVideo();
  const secondVideo = new FakeVideo();
  const harness = createHarness([{ active: true, sessionId: 9 }, { active: true, sessionId: 9 }], firstVideo);
  await poll(harness.controller);
  harness.setVideo(secondVideo);
  await poll(harness.controller);
  assert.strictEqual(secondVideo.pauseCalls, 1);
});

test('missing video is safe and cannot create resume ownership', async () => {
  const harness = createHarness([{ active: true, sessionId: 10 }, { active: false, sessionId: 10 }], null);
  await poll(harness.controller);
  await poll(harness.controller);
  assert.strictEqual(harness.controller.getState().isPausedByMe, false);
  assert.strictEqual(harness.controller.getState().pausedSessionId, null);
});

test('duplicate content-script evaluation keeps only one polling interval', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  const timers = [];
  const context = {
    window: {},
    document: { querySelector: () => null },
    chrome: { runtime: { sendMessage() {}, lastError: null } },
    console: { log() {}, error() {} },
    setInterval(callback) { timers.push(callback); return timers.length; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  vm.runInNewContext(source, context);
  vm.runInNewContext(source, context);
  assert.strictEqual(timers.length, 1);
});

test('inactive sessionId mismatch discards ownership and later polls never resume', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 1 },
    { active: false, sessionId: 2 },
    { active: false, sessionId: 2 }
  ], video);
  await poll(controller);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(video.playCalls, 0);
  assert.strictEqual(controller.getState().isPausedByMe, false);
  assert.strictEqual(controller.getState().pausedSessionId, null);
});

test('active sessionId mismatch discards ownership and later inactive poll never resumes', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 1 },
    { active: true, sessionId: 2 },
    { active: false, sessionId: 2 },
    { active: false, sessionId: 2 }
  ], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(controller.getState().isPausedByMe, false);
  assert.strictEqual(controller.getState().pausedSessionId, null);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(video.playCalls, 0);
});

test('success:false after active preserves state and ownership', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 20 },
    { __raw: { success: false, error: 'server unavailable' } }
  ], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(controller.getState().lastStateActive, true);
  assert.strictEqual(controller.getState().isPausedByMe, true);
  assert.strictEqual(controller.getState().pausedSessionId, 20);
});

test('undefined response after active preserves state and ownership', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 21 },
    { __raw: undefined }
  ], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(controller.getState().lastStateActive, true);
  assert.strictEqual(controller.getState().isPausedByMe, true);
  assert.strictEqual(controller.getState().pausedSessionId, 21);
});

test('request timeout after active preserves state and ownership', async () => {
  let timeoutCallback = null;
  let calls = 0;
  const video = new FakeVideo();
  const harness = createHarness([], video, {
    sendMessage(_message, callback) {
      calls += 1;
      if (calls === 1) callback({ success: true, data: { active: true, sessionId: 22 } });
    },
    setTimeout(callback) { timeoutCallback = callback; return 1; },
    clearTimeout() {}
  });
  await poll(harness.controller);
  const pending = harness.controller.pollState();
  timeoutCallback();
  await pending;
  assert.strictEqual(harness.controller.getState().lastStateActive, true);
  assert.strictEqual(harness.controller.getState().isPausedByMe, true);
  assert.strictEqual(harness.controller.getState().pausedSessionId, 22);
});

test('chrome.runtime.lastError after active preserves state and ownership', async () => {
  let calls = 0;
  const video = new FakeVideo();
  const harness = createHarness([], video, {
    sendMessage(_message, callback, runtime) {
      calls += 1;
      if (calls === 1) {
        callback({ success: true, data: { active: true, sessionId: 23 } });
        return;
      }
      runtime.lastError = { message: 'context invalidated' };
      callback(undefined);
      runtime.lastError = null;
    }
  });
  await poll(harness.controller);
  await poll(harness.controller);
  assert.strictEqual(harness.controller.getState().lastStateActive, true);
  assert.strictEqual(harness.controller.getState().isPausedByMe, true);
  assert.strictEqual(harness.controller.getState().pausedSessionId, 23);
});

test('synchronous sendMessage exception after active preserves state and ownership', async () => {
  let calls = 0;
  const video = new FakeVideo();
  const harness = createHarness([], video, {
    sendMessage(_message, callback) {
      calls += 1;
      if (calls === 1) {
        callback({ success: true, data: { active: true, sessionId: 24 } });
        return;
      }
      throw new Error('runtime disconnected');
    }
  });
  await poll(harness.controller);
  await poll(harness.controller);
  assert.strictEqual(harness.controller.getState().lastStateActive, true);
  assert.strictEqual(harness.controller.getState().isPausedByMe, true);
  assert.strictEqual(harness.controller.getState().pausedSessionId, 24);
});

test('invalid active value after active preserves state and ownership', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 25 },
    { active: 'true', sessionId: 25 }
  ], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(controller.getState().lastStateActive, true);
  assert.strictEqual(controller.getState().pausedSessionId, 25);
});

test('non-number sessionId after active preserves state and ownership', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 26 },
    { active: false, sessionId: '26' }
  ], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(controller.getState().lastStateActive, true);
  assert.strictEqual(controller.getState().pausedSessionId, 26);
  assert.strictEqual(video.playCalls, 0);
});

test('negative sessionId after active preserves state and ownership', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 27 },
    { active: false, sessionId: -1 }
  ], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(controller.getState().lastStateActive, true);
  assert.strictEqual(controller.getState().pausedSessionId, 27);
  assert.strictEqual(video.playCalls, 0);
});

test('duplicate poll does not issue a second request while the first is unresolved', async () => {
  const callbacks = [];
  const harness = createHarness([], new FakeVideo(), {
    sendMessage(_message, callback) { callbacks.push(callback); }
  });
  const first = harness.controller.pollState();
  const second = harness.controller.pollState();
  assert.strictEqual(callbacks.length, 1);
  assert.strictEqual(harness.controller.getState().isRequesting, true);
  callbacks[0]({ success: true, data: { active: false, sessionId: 0 } });
  await first;
  await second;
});

test('next poll issues a new request after the first request completes', async () => {
  const callbacks = [];
  const harness = createHarness([], new FakeVideo(), {
    sendMessage(_message, callback) { callbacks.push(callback); }
  });
  const first = harness.controller.pollState();
  callbacks[0]({ success: true, data: { active: false, sessionId: 0 } });
  await first;
  const second = harness.controller.pollState();
  assert.strictEqual(callbacks.length, 2);
  callbacks[1]({ success: true, data: { active: false, sessionId: 0 } });
  await second;
});

test('isRequesting is released after a successful response', async () => {
  const { controller } = createHarness([{ active: false, sessionId: 0 }]);
  await poll(controller);
  assert.strictEqual(controller.getState().isRequesting, false);
});

test('isRequesting is released after success:false', async () => {
  const { controller } = createHarness([{ __raw: { success: false, error: 'failed' } }]);
  await poll(controller);
  assert.strictEqual(controller.getState().isRequesting, false);
});

test('isRequesting is released after an invalid payload', async () => {
  const { controller } = createHarness([{ active: null, sessionId: 0 }]);
  await poll(controller);
  assert.strictEqual(controller.getState().isRequesting, false);
});

test('isRequesting is released after a timeout', async () => {
  let timeoutCallback;
  const harness = createHarness([], new FakeVideo(), {
    sendMessage() {},
    setTimeout(callback) { timeoutCallback = callback; return 1; },
    clearTimeout() {}
  });
  const pending = harness.controller.pollState();
  assert.strictEqual(harness.controller.getState().isRequesting, true);
  timeoutCallback();
  await pending;
  assert.strictEqual(harness.controller.getState().isRequesting, false);
});

test('video.play rejection does not break pause and resume in the next session', async () => {
  const video = new FakeVideo({ playError: new Error('autoplay denied') });
  const { controller } = createHarness([
    { active: true, sessionId: 30 },
    { active: false, sessionId: 30 },
    { active: true, sessionId: 31 },
    { active: false, sessionId: 31 }
  ], video);
  await poll(controller);
  await poll(controller);
  assert.strictEqual(controller.getState().isPausedByMe, false);
  video.playError = null;
  video.userPlay();
  await poll(controller);
  await poll(controller);
  assert.strictEqual(video.pauseCalls, 2);
  assert.strictEqual(video.playCalls, 2);
  assert.strictEqual(controller.getState().lastStateActive, false);
});

test('invalid state is ignored and the next valid state recovers', async () => {
  const video = new FakeVideo();
  const { controller } = createHarness([
    { active: true, sessionId: 32 },
    { active: 'invalid', sessionId: 32 },
    { active: true, sessionId: 32 }
  ], video);
  await poll(controller);
  video.paused = false;
  await poll(controller);
  assert.strictEqual(video.paused, false);
  assert.strictEqual(controller.getState().lastStateActive, true);
  await poll(controller);
  assert.strictEqual(video.paused, true);
  assert.strictEqual(controller.getState().pausedSessionId, 32);
});

test('new active session keeps ownership when an earlier resume finishes late', async () => {
  let finishPlay;
  const video = new FakeVideo();
  video.play = function playLater() {
    this.playCalls += 1;
    return new Promise(resolve => {
      finishPlay = () => {
        this.paused = false;
        const listener = this.listeners.get('play');
        if (listener) listener({ target: this });
        resolve();
      };
    });
  };
  const { controller } = createHarness([
    { active: true, sessionId: 40 },
    { active: false, sessionId: 40 },
    { active: true, sessionId: 41 }
  ], video);
  await poll(controller);
  await controller.pollState();
  await controller.pollState();
  finishPlay();
  await flushPromises();
  assert.strictEqual(video.paused, true);
  assert.strictEqual(controller.getState().pausedSessionId, 41);
  assert.strictEqual(controller.getState().isPausedByMe, true);
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
  console.log(`Content Script tests passed: ${passed} cases`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
