// YouTube Dictation Pause Control - Background Service Worker

const DEFAULT_SERVER_URL = 'http://127.0.0.1:17654';

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
  return function onMessage(message, _sender, sendResponse) {
    if (!message || message.type !== 'GET_STATE') return undefined;

    Promise.resolve()
      .then(() => getState())
      .then(sendResponse)
      .catch(error => {
        const errorMessage = error && error.message ? error.message : String(error);
        logger.error('[BG] state request failed', errorMessage);
        sendResponse({ success: false, error: errorMessage });
      });
    return true;
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStateResponder, createMessageListener };
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('[BG] background service worker loaded');
  const getState = createStateResponder();

  chrome.runtime.onMessage.addListener(createMessageListener({ getState, console }));
}
