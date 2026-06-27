const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVICE_NAME = 'youtube-dictation-pause';
const VERSION = '1.2.0';
const DEFAULT_PORT = 17654;
const DEFAULT_SETTINGS_PATH = path.join(__dirname, '..', 'config', 'settings.json');

let port = DEFAULT_PORT;

try {
  if (fs.existsSync(DEFAULT_SETTINGS_PATH)) {
    const settingsRaw = fs.readFileSync(DEFAULT_SETTINGS_PATH, 'utf8');
    const settings = JSON.parse(settingsRaw);
    if (settings.port) {
      port = Number.parseInt(settings.port, 10);
    }
  }
} catch (err) {
  console.error(`Error reading settings.json, falling back to default port ${DEFAULT_PORT}:`, err);
  port = DEFAULT_PORT;
}

const envPort = Number.parseInt(process.env.YDP_PORT || '', 10);
if (Number.isInteger(envPort) && envPort > 0 && envPort < 65536) {
  port = envPort;
}

const LOG_FILE_PATH = process.env.YDP_LOG_FILE
  ? path.resolve(process.env.YDP_LOG_FILE)
  : path.join(__dirname, '..', 'logs', 'control.log');

function logMessage(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `${timestamp} [SERVER] ${message}\n`;
  console.log(`[SERVER] ${message}`);

  try {
    const logDir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE_PATH, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

function isAllowedBrowserOrigin(origin) {
  return typeof origin === 'string'
    && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'));
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (!origin) {
    return true;
  }

  if (!isAllowedBrowserOrigin(origin)) {
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

let state = {
  active: false,
  sessionId: 0,
  updatedAt: new Date().toISOString(),
  source: 'ahk'
};

const server = http.createServer((req, res) => {
  const allowedCors = setCorsHeaders(req, res);
  if (!allowedCors) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { method, url } = req;

  if (method === 'GET' && url === '/health') {
    logMessage('GET /health');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: SERVICE_NAME, version: VERSION }));
    return;
  }

  if (method === 'GET' && url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  if (method === 'POST' && url === '/state') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const nextActive = !!payload.active;
        const source = payload.source || 'ahk';
        const prevActive = state.active;

        logMessage(`POST /state active=${nextActive}`);

        if (prevActive === false && nextActive === true) {
          state.sessionId += 1;
          logMessage('state changed inactive -> active');
        } else if (prevActive === true && nextActive === false) {
          logMessage('state changed active -> inactive');
        }

        state.active = nextActive;
        state.source = source;
        state.updatedAt = new Date().toISOString();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
      } catch (err) {
        logMessage(`ERROR: Failed to parse POST /state payload: ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (method === 'POST' && url === '/reset') {
    logMessage('POST /reset');
    state.active = false;
    state.sessionId = 0;
    state.updatedAt = new Date().toISOString();
    state.source = 'api';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  logMessage(`ERROR: Route not found: ${method} ${url}`);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(port, '127.0.0.1', () => {
  logMessage(`server started on http://127.0.0.1:${port}`);
});
