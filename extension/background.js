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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStateResponder };
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('[BG] background service worker loaded');
  const getState = createStateResponder();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'GET_STATE') return undefined;

    getState().then(sendResponse).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  });
}
