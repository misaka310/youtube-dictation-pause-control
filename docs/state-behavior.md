# State behavior

The AutoHotkey layer updates the local HTTP Bridge. The extension polls that state every 500ms and controls only YouTube playback.

| Previous | Current | Extension behavior |
|---|---|---|
| inactive | active | Pause a playing video once and remember its `sessionId`. |
| active | active | Pause Guard pauses again only if the extension-paused video starts playing. |
| active | inactive | Resume only a video paused by the extension in the same `sessionId`. |
| inactive | inactive | Do not touch the video. |

`sessionId` increases only on an inactive-to-active transition. Repeated active reports are part of the same session.

## Safe handling

- A video already paused by the user is never resumed.
- When a YouTube SPA navigation replaces the video element during dictation, the new playing video is paused.
- A tab without a video is ignored.
- A rejected `video.play()` is logged and does not reactivate the state.
- Content Script duplicate loading is ignored, and only one polling timer is kept.

## Manual browser check

1. Start a YouTube video, then start Typeless or Wispr Flow dictation.
2. Confirm the video pauses and resumes only when dictation ends.
3. During dictation, try to resume playback and confirm Pause Guard pauses it again.
4. During dictation, navigate to another YouTube video and confirm the new video is paused.
5. Start with an already paused video and confirm it stays paused when dictation ends.
