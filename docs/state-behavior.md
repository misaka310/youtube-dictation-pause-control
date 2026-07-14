# 状態遷移の仕様

AutoHotkeyがローカルHTTP Bridgeへ状態を送信し、Background Workerを経由してContent Scriptが500ms間隔で取得します。拡張機能が操作するのはYouTubeのvideo要素だけです。

| 直前の状態 | 現在の状態 | 動作 |
|---|---|---|
| inactive | active | 再生中の動画だけを一度停止し、その`sessionId`を記録する。 |
| active | active | 拡張機能が停止した動画だけをPause Guardで再停止する。 |
| active | inactive | 同じ`sessionId`で拡張機能が停止した動画だけを再生する。 |
| inactive | inactive | 動画を操作しない。 |

## セッションと所有権

- `sessionId`はinactiveからactiveになったときだけ増えます。active状態の再送では増えません。
- もともとユーザーが停止していた動画は、終了時にも再生しません。
- 終了後の`video.play()`が完了する前に新しい入力が始まった場合、新しいsessionが停止の所有権を引き継ぎます。遅れて再生が完了してもPause Guardが再停止します。

## 例外時の動作

- Background Workerの通信失敗、タイムアウト、不正なJSON、不正なstateでは前回の状態を変更しません。
- YouTubeのSPA遷移でvideo要素が置き換わった場合、入力中なら新しい再生中動画を停止します。
- video要素が存在しないタブでは何もしません。
- `video.play()`が拒否された場合はログに記録し、入力状態を変更しません。
- Content Scriptの二重読み込みでは既存のポーリングを増やしません。

## 手動確認

1. 再生中のYouTube動画でTypelessまたはWispr Flowの入力を開始し、停止を確認する。
2. 入力終了後、拡張機能が停止した動画だけが再生されることを確認する。
3. 最初から停止中の動画が終了後も停止したままであることを確認する。
4. 入力中に動画を再生しようとし、Pause Guardで再停止されることを確認する。
5. 入力中に別のYouTube動画へ移動し、新しい動画も停止されることを確認する。
