// YouTube Dictation Pause Control - Content Script

if (window.__youtubeDictationPauseLoaded) {
  console.log('[EXT] duplicate content script detected; skipping');
} else {
  window.__youtubeDictationPauseLoaded = true;
  console.log('[EXT] content script loaded');

  // 内部状態管理変数
  let lastStateActive = false;
  let pausedSessionId = null;
  let isPausedByMe = false;
  let pollingIntervalMs = 500; // ポーリング間隔 500ms
  let isRequesting = false; // 多重リクエスト防止用フラグ
  
  // 制御強化用の追加変数
  let targetVideo = null;
  let blockCounter = 0;

  // play イベント監視リスナー
  function onPlayBlocked(event) {
    const video = event.target;
    if (lastStateActive && isPausedByMe && pausedSessionId !== null) {
      video.pause();
      blockCounter++;
      console.log(`[EXT] play event blocked while active sessionId=${pausedSessionId} (count=${blockCounter})`);
    }
  }

  // video要素のアタッチ・デタッチ制御関数
  function updateVideoAttachment() {
    const currentVideo = document.querySelector('video');
    if (currentVideo !== targetVideo) {
      if (targetVideo) {
        try {
          targetVideo.removeEventListener('play', onPlayBlocked);
        } catch (e) {
          // ignore
        }
      }

      if (lastStateActive) {
        console.log('[EXT] video element changed while active');
      } else {
        console.log('[EXT] video element changed');
      }

      targetVideo = currentVideo;

      if (targetVideo) {
        targetVideo.addEventListener('play', onPlayBlocked);
        
        // もし現在アクティブで、自分が停止させた状態なら、新しいビデオも即座に停止
        if (lastStateActive && isPausedByMe && pausedSessionId !== null) {
          const isPlaying = !targetVideo.paused && !targetVideo.ended && targetVideo.readyState >= 2;
          if (isPlaying) {
            targetVideo.pause();
            console.log(`[EXT] immediate pause applied to new video element sessionId=${pausedSessionId}`);
          }
        }
      }
    }
  }

  // バックグラウンドへのリクエストをタイムアウト付き Promise でラップする関数
  function requestStateWithTimeout(timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // タイムアウトタイマーのセット
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('background request timeout'));
        }
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
          clearTimeout(timer);
          if (resolved) return; // すでにタイムアウト済みの場合は終了
          resolved = true;

          if (chrome.runtime.lastError) {
            reject(new Error(`chrome.runtime.lastError=${chrome.runtime.lastError.message}`));
            return;
          }

          resolve(response);
        });
      } catch (err) {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      }
    });
  }

  // バックグラウンド経由で状態を取得するポーリング処理
  function pollState() {
    // 500ms 周期で video 要素の変更をチェックし、アタッチを常に最新に保つ
    updateVideoAttachment();

    if (isRequesting) {
      return;
    }
    isRequesting = true;

    console.log('[EXT] requesting state via background');

    requestStateWithTimeout(1000)
      .then(response => {
        isRequesting = false;
        
        const rawString = response === undefined ? 'undefined' : JSON.stringify(response);
        console.log(`[EXT] background response raw=${rawString}`);

        if (response && response.success) {
          const state = response.data;
          const currentActive = !!state.active;
          const sessionId = parseInt(state.sessionId, 10);

          console.log(`[EXT] received state active=${currentActive}, sessionId=${sessionId}`);

          // A. 状態遷移: false -> true (録音開始)
          if (currentActive && !lastStateActive) {
            console.log('[EXT] transition inactive -> active');
            blockCounter = 0; // ブロックカウンターを初期化
            handleStartPause(targetVideo, sessionId);
          }
          // B. 状態遷移: true -> false (録音終了)
          else if (!currentActive && lastStateActive) {
            console.log('[EXT] transition active -> inactive');
            handleEndResume(targetVideo, sessionId);
          }
          // C. 状態継続: active が true のまま維持されている場合 (YouTubeの自動再生復帰対策)
          else if (currentActive && lastStateActive) {
            applyPauseGuard(targetVideo, sessionId);
          }

          lastStateActive = currentActive;
        } else {
          const errDetail = response ? response.error : 'No response data';
          console.error('[EXT] background state request failed', errDetail);
          // 通信失敗時は lastStateActive を戻さない
        }
      })
      .catch(err => {
        isRequesting = false;
        const errMsg = err.message;
        if (errMsg === 'background request timeout') {
          console.error('[EXT] background request timeout');
        } else if (errMsg.startsWith('chrome.runtime.lastError=')) {
          console.error(`[EXT] ${errMsg}`);
        } else {
          console.error(`[EXT] ${errMsg}`);
        }
        // エラー時も lastStateActive を戻さない
      });
  }

  // 録音開始時の一時停止処理
  function handleStartPause(video, sessionId) {
    if (video) {
      const isPaused = video.paused;
      console.log(`[EXT] video found paused=${isPaused}`);

      const isPlaying = !video.paused && !video.ended && video.readyState >= 2;
      if (isPlaying) {
        video.pause();
        isPausedByMe = true;
        pausedSessionId = sessionId;
        console.log(`[EXT] paused by script sessionId=${sessionId}`);
      } else {
        isPausedByMe = false;
        pausedSessionId = null;
        console.log('[EXT] skipped because already paused');
      }
    } else {
      console.log('[EXT] video not found');
    }
  }

  // 録音中 (active=true) に動画が勝手に再生状態に戻ってしまった場合の再一時停止処理 (playリスナーのフェールセーフ)
  function applyPauseGuard(video, sessionId) {
    if (video && isPausedByMe && pausedSessionId === sessionId) {
      const isPlaying = !video.paused && !video.ended && video.readyState >= 2;
      if (isPlaying) {
        video.pause();
        console.log(`[EXT] pause guard reapplied sessionId=${sessionId}`);
      }
    }
  }

  // 録音終了時の再生再開処理
  function handleEndResume(video, sessionId) {
    if (video) {
      if (isPausedByMe && pausedSessionId === sessionId) {
        if (video.paused) {
          // play() を呼び出す前に状態フラグをクリアし、再生が play リスナーでブロックされるのを防ぐ
          const targetSessionId = pausedSessionId;
          isPausedByMe = false;
          pausedSessionId = null;

          video.play()
            .then(() => {
              console.log(`[EXT] resumed by script sessionId=${targetSessionId}`);
            })
            .catch(err => {
              console.error('[EXT] failed to play video:', err);
            });
        } else {
          isPausedByMe = false;
          pausedSessionId = null;
        }
      } else {
        if (pausedSessionId === null && !isPausedByMe) {
          console.log('[EXT] skipped because active=false initial state');
        } else {
          console.log('[EXT] skipped resume because no video paused by extension');
        }
        isPausedByMe = false;
        pausedSessionId = null;
      }
    } else {
      console.log('[EXT] video not found');
      isPausedByMe = false;
      pausedSessionId = null;
    }
  }

  // YouTube SPA遷移等で古いインターバルが残っている場合、安全にクリーンアップします
  if (window.__youtubeDictationIntervalId) {
    clearInterval(window.__youtubeDictationIntervalId);
    window.__youtubeDictationIntervalId = null;
  }

  // 新しいポーリングのインターバルをグローバルに登録・開始します
  window.__youtubeDictationIntervalId = setInterval(pollState, pollingIntervalMs);
}


