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

function createHarness(states, initialVideo = new FakeVideo()) {
  let video = initialVideo;
  const logs = [];
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(_message, callback) {
        callback({ success: true, data: states.shift() });
      }
    }
  };
  const controller = createPauseController({
    window: {},
    document: { querySelector: () => video },
    chrome,
    console: { log: message => logs.push(message), error: message => logs.push(message) }
  });
  return { controller, logs, setVideo: nextVideo => { video = nextVideo; } };
}

async function poll(controller) {
  await controller.pollState();
  await Promise.resolve();
}

async function main() {
  // inactive -> active pauses once and records the session.
  {
    const video = new FakeVideo();
    const { controller } = createHarness([{ active: true, sessionId: 1 }], video);
    await poll(controller);
    assert.strictEqual(video.pauseCalls, 1);
    assert.deepStrictEqual(controller.getState().pausedSessionId, 1);
  }

  // active -> inactive resumes only the video paused by this extension.
  {
    const video = new FakeVideo();
    const { controller } = createHarness([{ active: true, sessionId: 3 }, { active: false, sessionId: 3 }], video);
    await poll(controller); await poll(controller);
    assert.strictEqual(video.playCalls, 1);
  }

  // Initial inactive state never resumes a user-paused video.
  {
    const video = new FakeVideo({ paused: true });
    const { controller } = createHarness([{ active: false, sessionId: 0 }], video);
    await poll(controller);
    assert.strictEqual(video.playCalls, 0);
  }

  // Repeated active state is idempotent while the video remains paused.
  {
    const video = new FakeVideo();
    const { controller } = createHarness([{ active: true, sessionId: 5 }, { active: true, sessionId: 5 }], video);
    await poll(controller); await poll(controller);
    assert.strictEqual(video.pauseCalls, 1);
  }

  // Pause Guard blocks YouTube or user playback during the active session.
  {
    const video = new FakeVideo();
    const { controller } = createHarness([{ active: true, sessionId: 6 }], video);
    await poll(controller); video.userPlay();
    assert.strictEqual(video.paused, true);
    assert.strictEqual(video.pauseCalls, 2);
  }

  // A new session can pause and resume independently of the preceding session.
  {
    const video = new FakeVideo();
    const { controller } = createHarness([
      { active: true, sessionId: 7 }, { active: false, sessionId: 7 },
      { active: true, sessionId: 8 }, { active: false, sessionId: 8 }
    ], video);
    await poll(controller); await poll(controller); await poll(controller); await poll(controller);
    assert.strictEqual(video.pauseCalls, 2);
    assert.strictEqual(video.playCalls, 2);
  }

  // SPA video replacement is attached and paused while dictation remains active.
  {
    const firstVideo = new FakeVideo();
    const secondVideo = new FakeVideo();
    const harness = createHarness([{ active: true, sessionId: 9 }, { active: true, sessionId: 9 }], firstVideo);
    await poll(harness.controller); harness.setVideo(secondVideo); await poll(harness.controller);
    assert.strictEqual(secondVideo.pauseCalls, 1);
  }

  // Missing video is safe and cannot cause a later unsolicited resume.
  {
    const harness = createHarness([{ active: true, sessionId: 10 }, { active: false, sessionId: 10 }], null);
    await poll(harness.controller); await poll(harness.controller);
    assert.strictEqual(harness.controller.getState().isPausedByMe, false);
  }

  // Autoplay rejection is handled without leaving extension ownership behind.
  {
    const video = new FakeVideo({ playError: new Error('autoplay denied') });
    const { controller } = createHarness([{ active: true, sessionId: 11 }, { active: false, sessionId: 11 }], video);
    await poll(controller); await poll(controller);
    assert.strictEqual(controller.getState().isPausedByMe, false);
    assert.strictEqual(video.playCalls, 1);
  }

  // A new active session keeps ownership even when the previous resume finishes later.
  {
    let finishPlay;
    const video = new FakeVideo();
    video.play = function playLater() {
      this.playCalls += 1;
      return new Promise(resolve => { finishPlay = () => { this.paused = false; const listener = this.listeners.get('play'); if (listener) listener({ target: this }); resolve(); }; });
    };
    const { controller } = createHarness([
      { active: true, sessionId: 12 }, { active: false, sessionId: 12 }, { active: true, sessionId: 13 }
    ], video);
    await poll(controller); await poll(controller); await poll(controller);
    finishPlay(); await Promise.resolve(); await Promise.resolve();
    assert.strictEqual(video.paused, true);
    assert.strictEqual(controller.getState().pausedSessionId, 13);
  }

  // Re-evaluating the content script keeps the existing polling interval.
  {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
    const timers = [];
    const context = {
      window: {},
      document: { querySelector: () => null },
      chrome: { runtime: { sendMessage() {}, lastError: null } },
      console: { log() {}, error() {} },
      setInterval(callback) { timers.push(callback); return timers.length; },
      clearInterval() {}
    };
    vm.runInNewContext(source, context);
    vm.runInNewContext(source, context);
    assert.strictEqual(timers.length, 1);
  }

  console.log('Extension content test passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
