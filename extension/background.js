// YouTube Dictation Pause Control - Background Service Worker

console.log('[BG] background service worker loaded');

const SERVER_URL = 'http://127.0.0.1:17654';

// content.js からのメッセージを受け取る
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'GET_STATE') {
    console.log('[BG] GET_STATE received');

    // 非同期処理を安全に実行するための自己実行関数
    (async () => {
      console.log('[BG] fetching state from localhost');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 800);

      try {
        const response = await fetch(`${SERVER_URL}/state`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        console.log(`[BG] localhost fetch status=${response.status}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[BG] fetched state active=${data.active}, sessionId=${data.sessionId}`);

        try {
          sendResponse({ success: true, data: data });
          console.log('[BG] sendResponse success');
        } catch (sendErr) {
          console.error('[BG] sendResponse error', sendErr.message);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        const errMsg = err.name === 'AbortError' ? 'Fetch timeout (800ms)' : err.message;
        console.error('[BG] fetch failed', errMsg);

        try {
          sendResponse({ success: false, error: errMsg });
          console.log('[BG] sendResponse success (error payload)');
        } catch (sendErr) {
          console.error('[BG] sendResponse error', sendErr.message);
        }
      }
    })();

    // 非同期レスポンスを保証するために true を返します
    return true;
  }
});

