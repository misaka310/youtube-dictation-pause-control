const assert = require('assert');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const packageJson = require('../package.json');

const ROOT = path.resolve(__dirname, '..');
const PORT = 22000 + Math.floor(Math.random() * 20000);
const LOG_FILE = path.join(os.tmpdir(), `youtube-dictation-pause-smoke-${process.pid}.log`);
const API_CASE_COUNT = 18;

function request(method, route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: route,
        method,
        headers: {
          ...headers,
          ...(data ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          } : {})
        },
        timeout: 1500
      },
      res => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          raw += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch (err) {
            reject(new Error(`Invalid JSON from ${method} ${route}: ${raw}`));
            return;
          }
          resolve({ statusCode: res.statusCode, body: json });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout calling ${method} ${route}`));
    });
    req.on('error', reject);

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function waitForServer(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const health = await request('GET', '/health');
      if (health.statusCode === 200 && health.body && health.body.ok) {
        return health;
      }
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  throw lastError || new Error('Server did not become healthy');
}

async function main() {
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      YDP_PORT: String(PORT),
      YDP_LOG_FILE: LOG_FILE
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  try {
    const health = await waitForServer();
    assert.strictEqual(health.body.service, 'youtube-dictation-pause');
    assert.strictEqual(health.body.version, packageJson.version);

    const initialState = await request('GET', '/state');
    assert.strictEqual(initialState.statusCode, 200);
    assert.strictEqual(initialState.body.active, false);
    assert.strictEqual(initialState.body.sessionId, 0);
    assert.deepStrictEqual(initialState.body.activeSources, []);

    const activeState = await request('POST', '/state', { active: true, source: 'ahk' });
    assert.strictEqual(activeState.statusCode, 200);
    assert.strictEqual(activeState.body.active, true);
    assert.strictEqual(activeState.body.sessionId, 1);
    assert.strictEqual(activeState.body.source, 'ahk');
    assert.deepStrictEqual(activeState.body.activeSources, ['ahk']);

    const repeatedActive = await request('POST', '/state', { active: true, source: 'ahk' });
    assert.strictEqual(repeatedActive.body.sessionId, 1);

    const localVoiceActive = await request('POST', '/state', { active: true, source: 'local-voice-bridge' });
    assert.strictEqual(localVoiceActive.body.active, true);
    assert.strictEqual(localVoiceActive.body.sessionId, 1);
    assert.deepStrictEqual(localVoiceActive.body.activeSources, ['ahk', 'local-voice-bridge']);

    const localVoiceInactive = await request('POST', '/state', { active: false, source: 'local-voice-bridge' });
    assert.strictEqual(localVoiceInactive.body.active, true);
    assert.strictEqual(localVoiceInactive.body.sessionId, 1);
    assert.deepStrictEqual(localVoiceInactive.body.activeSources, ['ahk']);

    const stillActive = await request('GET', '/state');
    assert.strictEqual(stillActive.body.active, true);
    assert.strictEqual(stillActive.body.sessionId, 1);

    const inactiveState = await request('POST', '/state', { active: false, source: 'ahk' });
    assert.strictEqual(inactiveState.statusCode, 200);
    assert.strictEqual(inactiveState.body.active, false);
    assert.strictEqual(inactiveState.body.sessionId, 1);
    assert.deepStrictEqual(inactiveState.body.activeSources, []);

    const localVoiceOnly = await request('POST', '/state', { active: true, source: 'local-voice-bridge' });
    assert.strictEqual(localVoiceOnly.body.active, true);
    assert.strictEqual(localVoiceOnly.body.sessionId, 2);
    assert.deepStrictEqual(localVoiceOnly.body.activeSources, ['local-voice-bridge']);

    const clearAllSources = await request('POST', '/state', { active: false, source: '*' });
    assert.strictEqual(clearAllSources.body.active, false);
    assert.strictEqual(clearAllSources.body.sessionId, 2);
    assert.deepStrictEqual(clearAllSources.body.activeSources, []);

    const invalidJson = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/state', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(raw) }));
      });
      req.on('error', reject);
      req.end('{');
    });
    assert.strictEqual(invalidJson.statusCode, 400);
    assert.strictEqual(invalidJson.body.error, 'Invalid JSON');

    const unknownRoute = await request('GET', '/missing');
    assert.strictEqual(unknownRoute.statusCode, 404);

    const extensionOrigin = 'chrome-extension://test-extension-id';
    const corsAllowed = await request('GET', '/state', undefined, { Origin: extensionOrigin });
    assert.strictEqual(corsAllowed.statusCode, 200);
    assert.strictEqual(corsAllowed.body.active, false);

    const firefoxOrigin = await request('GET', '/state', undefined, { Origin: 'moz-extension://test-extension-id' });
    assert.strictEqual(firefoxOrigin.statusCode, 200);

    const corsDenied = await request('GET', '/state', undefined, { Origin: 'https://example.com' });
    assert.strictEqual(corsDenied.statusCode, 403);
    assert.strictEqual(corsDenied.body.error, 'Origin not allowed');

    const preflight = await request('OPTIONS', '/state', undefined, { Origin: extensionOrigin });
    assert.strictEqual(preflight.statusCode, 204);

    const resetState = await request('POST', '/reset');
    assert.strictEqual(resetState.statusCode, 200);
    assert.strictEqual(resetState.body.active, false);
    assert.strictEqual(resetState.body.sessionId, 0);
    assert.deepStrictEqual(resetState.body.activeSources, []);

    const afterReset = await request('POST', '/state', { active: true, source: 'test' });
    assert.strictEqual(afterReset.body.sessionId, 1);

    console.log(`API tests passed: ${API_CASE_COUNT} cases`);
  } catch (err) {
    console.error('Smoke API test failed');
    console.error(err);
    console.error('server stdout:');
    console.error(stdout);
    console.error('server stderr:');
    console.error(stderr);
    process.exitCode = 1;
  } finally {
    child.kill();
  }
}

main();
