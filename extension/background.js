// YouTube Dictation Pause Control - Background Service Worker

if (typeof importScripts === 'function') {
  importScripts('agent-reload.js');
}

const DEFAULT_SERVER_URL = 'http://127.0.0.1:17654';
const YOUTUBE_URL_PATTERNS = [
  'https://www.youtube.com/*',
  'https://youtube.com/*',
  'https://m.youtube.com/*'
];

function createStateResponder(deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const AbortControllerCtor = deps.AbortController || AbortController;
  const logger = deps.console || console;
  const serverUrl = deps.serverUrl || DEFAULT_SERVER_URL;
  const timeoutMs = deps.timeoutMs || 800;

  return async function getState() {
    const controller = new AbortControllerCtor();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(`${serverUrl}/state`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      logger.log(`[BG] fetched state active=${data.active}, sessionId=${data.sessionId}`);
      return { success: true, data };
    } catch (error) {
      const errorMessage = error && error.name === 'AbortError' ? `Fetch timeout (${timeoutMs}ms)` : error.message;
      logger.error('[BG] fetch failed', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

function createMessageListener({ getState, console: logger = console } = {}) {
  function safeSendResponse(sendResponse, payload) {
    try {
      sendResponse(payload);
      return true;
    } catch (error) {
      const errorMessage = error && error.message ? error.message : String(error);
      logger.error('[BG] sendResponse failed', errorMessage);
      return false;
    }
  }

  return function onMessage(message, _sender, sendResponse) {
    if (!message || message.type !== 'GET_STATE') return undefined;

    Promise.resolve()
      .then(() => getState())
      .then(
        response => {
          safeSendResponse(sendResponse, response);
        },
        error => {
          const errorMessage = error && error.message ? error.message : String(error);
          logger.error('[BG] state request failed', errorMessage);
          safeSendResponse(sendResponse, { success: false, error: errorMessage });
        }
      );
    return true;
  };
}

function createExistingTabInjector({ chrome: chromeApi, console: logger = console } = {}) {
  return async function injectExistingYouTubeTabs() {
    const summary = { attempted: 0, injected: 0, failed: 0 };
    if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) {
      logger.error('[BG] existing-tab injection unavailable');
      return summary;
    }

    let tabs;
    try {
      tabs = await new Promise((resolve, reject) => {
        chromeApi.tabs.query({ url: YOUTUBE_URL_PATTERNS }, result => {
          const lastError = chromeApi.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }
          resolve(Array.isArray(result) ? result : []);
        });
      });
    } catch (error) {
      const errorMessage = error && error.message ? error.message : String(error);
      logger.error('[BG] failed to query existing YouTube tabs', errorMessage);
      return summary;
    }

    for (const tab of tabs) {
      if (!Number.isInteger(tab?.id)) continue;
      summary.attempted += 1;
      try {
        await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        summary.injected += 1;
      } catch (error) {
        const errorMessage = error && error.message ? error.message : String(error);
        summary.failed += 1;
        logger.error(`[BG] failed to inject content script into tab ${tab.id}`, errorMessage);
      }
    }

    return summary;
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStateResponder, createMessageListener, createExistingTabInjector };
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('[BG] background service worker loaded');
  const getState = createStateResponder();

  chrome.runtime.onMessage.addListener(createMessageListener({ getState, console }));
  createExistingTabInjector({ chrome, console })()
    .then(summary => {
      if (summary.attempted > 0) {
        console.log(`[BG] existing YouTube tabs refreshed injected=${summary.injected} failed=${summary.failed}`);
      }
    })
    .catch(error => console.error('[BG] existing-tab refresh failed', error.message));
}
