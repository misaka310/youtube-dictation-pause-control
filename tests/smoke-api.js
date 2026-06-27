const assert = require('assert');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 22000 + Math.floor(Math.random() * 20000);
const LOG_FILE = path.join(os.tmpdir(), `youtube-dictation-pause-smoke-${process.pid}.log`);

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: route,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data)
            }
          : undefined,
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
    assert.strictEqual(health.body.version, '1.2.0');

    const initialState = await request('GET', '/state');
    assert.strictEqual(initialState.statusCode, 200);
    assert.strictEqual(initialState.body.active, false);
    assert.strictEqual(initialState.body.sessionId, 0);

    const activeState = await request('POST', '/state', { active: true, source: 'test' });
    assert.strictEqual(activeState.statusCode, 200);
    assert.strictEqual(activeState.body.active, true);
    assert.strictEqual(activeState.body.sessionId, 1);
    assert.strictEqual(activeState.body.source, 'test');

    const stillActive = await request('GET', '/state');
    assert.strictEqual(stillActive.body.active, true);
    assert.strictEqual(stillActive.body.sessionId, 1);

    const inactiveState = await request('POST', '/state', { active: false, source: 'test' });
    assert.strictEqual(inactiveState.statusCode, 200);
    assert.strictEqual(inactiveState.body.active, false);
    assert.strictEqual(inactiveState.body.sessionId, 1);

    const resetState = await request('POST', '/reset');
    assert.strictEqual(resetState.statusCode, 200);
    assert.strictEqual(resetState.body.active, false);
    assert.strictEqual(resetState.body.sessionId, 0);

    console.log('Smoke API test passed');
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
