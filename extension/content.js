// YouTube Dictation Pause Control - Content Script

function createPauseController(deps) {
  const browserWindow = deps.window;
  const browserDocument = deps.document;
  const runtime = deps.chrome.runtime;
  const logger = deps.console || console;
  const setTimer = deps.setInterval || setInterval;
  const clearTimer = deps.clearInterval || clearInterval;
  const requestTimeoutMs = deps.requestTimeoutMs || 1000;
  const pollingIntervalMs = deps.pollingIntervalMs || 500;

  let lastStateActive = false;
  let pausedSessionId = null;
  let isPausedByMe = false;
  let targetVideo = null;
  let blockCounter = 0;
  let isRequesting = false;
  let activeSessionId = null;
  let resumeInFlight = false;

  function isPlaying(video) {
    return !!video && !video.paused && !video.ended && video.readyState >= 2;
  }

  function onPlayBlocked(event) {
    const video = event.target;
    if (lastStateActive && isPausedByMe && pausedSessionId !== null) {
      video.pause();
      blockCounter += 1;
      logger.log(`[EXT] play event blocked while active sessionId=${pausedSessionId} (count=${blockCounter})`);
    }
  }

  function updateVideoAttachment() {
    const currentVideo = browserDocument.querySelector('video');
    if (currentVideo === targetVideo) return;

    if (targetVideo) targetVideo.removeEventListener('play', onPlayBlocked);
    targetVideo = currentVideo;
    logger.log(lastStateActive ? '[EXT] video element changed while active' : '[EXT] video element changed');

    if (targetVideo) {
      targetVideo.addEventListener('play', onPlayBlocked);
      if (lastStateActive && isPausedByMe && pausedSessionId !== null && isPlaying(targetVideo)) {
        targetVideo.pause();
        logger.log(`[EXT] immediate pause applied to new video element sessionId=${pausedSessionId}`);
      }
    }
  }

  function requestStateWithTimeout() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('background request timeout'));
        }
      }, requestTimeoutMs);

      try {
        runtime.sendMessage({ type: 'GET_STATE' }, response => {
          clearTimeout(timeout);
          if (settled) return;
          settled = true;
          if (runtime.lastError) {
            reject(new Error(`chrome.runtime.lastError=${runtime.lastError.message}`));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  }

  function handleStartPause(video, sessionId) {
    activeSessionId = sessionId;
    if (!video) {
      logger.log('[EXT] video not found');
      return;
    }

    if (isPlaying(video)) {
      video.pause();
      isPausedByMe = true;
      pausedSessionId = sessionId;
      logger.log(`[EXT] paused by script sessionId=${sessionId}`);
    } else {
      if (resumeInFlight) {
        isPausedByMe = true;
        pausedSessionId = sessionId;
        logger.log(`[EXT] pause ownership transferred to sessionId=${sessionId}`);
      } else {
        isPausedByMe = false;
        pausedSessionId = null;
        logger.log('[EXT] skipped because already paused');
      }
    }
  }

  function applyPauseGuard(video, sessionId) {
    if (isPausedByMe && pausedSessionId === sessionId && isPlaying(video)) {
      video.pause();
      logger.log(`[EXT] pause guard reapplied sessionId=${sessionId}`);
    }
  }

  function handleEndResume(video, sessionId) {
    activeSessionId = null;
    if (!video || !isPausedByMe || pausedSessionId !== sessionId) {
      isPausedByMe = false;
      pausedSessionId = null;
      logger.log(video ? '[EXT] skipped resume because no video paused by extension' : '[EXT] video not found');
      return;
    }

    const targetSessionId = pausedSessionId;
    isPausedByMe = false;
    pausedSessionId = null;
    if (!video.paused) return;
    resumeInFlight = true;

    Promise.resolve(video.play())
      .then(() => {
        if (lastStateActive && activeSessionId !== null) {
          isPausedByMe = true;
          pausedSessionId = activeSessionId;
          video.pause();
          logger.log(`[EXT] resume superseded by active sessionId=${activeSessionId}`);
          return;
        }
        logger.log(`[EXT] resumed by script sessionId=${targetSessionId}`);
      })
      .catch(error => logger.error('[EXT] failed to play video:', error))
      .finally(() => { resumeInFlight = false; });
  }

  async function pollState() {
    updateVideoAttachment();
    if (isRequesting) return;
    isRequesting = true;

    try {
      const response = await requestStateWithTimeout();
      if (!response || !response.success) {
        logger.error('[EXT] background state request failed', response && response.error);
        return;
      }

      const state = response.data;
      if (!state || typeof state.active !== 'boolean') {
        throw new Error('invalid state payload');
      }
      const currentActive = state.active;
      const sessionId = Number.parseInt(state.sessionId, 10);
      if (!Number.isInteger(sessionId) || sessionId < 0) {
        throw new Error('invalid state sessionId');
      }

      if (currentActive && !lastStateActive) {
        blockCounter = 0;
        handleStartPause(targetVideo, sessionId);
      } else if (!currentActive && lastStateActive) {
        handleEndResume(targetVideo, sessionId);
      } else if (currentActive && lastStateActive) {
        applyPauseGuard(targetVideo, sessionId);
      }
      lastStateActive = currentActive;
    } catch (error) {
      logger.error(`[EXT] ${error.message}`);
    } finally {
      isRequesting = false;
    }
  }

  function start() {
    if (browserWindow.__youtubeDictationIntervalId) clearTimer(browserWindow.__youtubeDictationIntervalId);
    browserWindow.__youtubeDictationIntervalId = setTimer(pollState, pollingIntervalMs);
  }

  return {
    pollState,
    start,
    updateVideoAttachment,
    getState: () => ({ lastStateActive, pausedSessionId, isPausedByMe, blockCounter, targetVideo, activeSessionId, resumeInFlight })
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createPauseController };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  if (window.__youtubeDictationPauseLoaded) {
    console.log('[EXT] duplicate content script detected; skipping');
  } else {
    window.__youtubeDictationPauseLoaded = true;
    console.log('[EXT] content script loaded');
    createPauseController({ window, document, chrome }).start();
  }
}
