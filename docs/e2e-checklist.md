# 実ブラウザE2Eチェックリスト

この文書は、実際のWindows、配布版`YouTubeDictationControl.exe`、Typeless / Wispr Flow、Chromium系ブラウザ、YouTube画面で行う手動確認用です。Node.jsだけの自動テスト結果を実ブラウザE2Eの実施結果として転記しないでください。

## 共通準備

- Chromium系ブラウザとTypeless / Wispr Flowを用意する。配布版にはNode.jsとAutoHotkeyが含まれるため、どちらも別インストールは不要。
- `extension`をパッケージ化されていない拡張機能として読み込む。
- 配布フォルダの`YouTubeDictationControl.exe`を起動する。
- ターミナルが開いたままにならず、Windows右下の通知領域にアイコンが表示されることを確認する。
- 通知領域メニューの`Status: ...`が`running`になり、`http://127.0.0.1:17654/health`が`ok: true`を返すことを確認する。
- `logs/control.log`とYouTubeタブのDevToolsコンソールを開く。
- 各ケース開始前に、Typeless / Wispr Flowが録音していないことを確認する。内部状態が不明なら入力アプリを停止して`Ctrl + Alt + R`または通知領域の`Reset dictation state`を実行する。Bridgeだけを初期化する必要がある場合に限り、`curl.exe -X POST http://127.0.0.1:17654/reset`を使用する。

## 常駐アプリの事前確認

1. 通知領域メニューから`Open log`を選び、現在の配布フォルダの`logs/control.log`が開くこと。
2. `Restart local bridge`を選び、Bridgeが再び`running`になること。
3. `Start with Windows`をオン・オフし、現在のユーザーのスタートアップフォルダにショートカットが作成・削除されること。
4. `Exit`を選び、通知領域アイコンと、このEXEが起動したNode.jsだけが終了すること。
5. 自動検証可能な範囲は次を実行し、`bundledNodeVersion`が`v24.18.0`、`recoveryVerified`と`ownedShutdownVerified`がともに`true`になること。

```powershell
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-release-runtime.ps1 `
  -PackageDirectory "dist\YouTubeDictationPauseControl-$version"
```

## 記録ルール

各ケースの「実施結果欄」は、実際に操作した場合だけ更新します。今回の文書更新時点では、下記20ケースはすべて実ブラウザ未実施です。

---

## 1. Wispr Flow開始・終了

**前提条件**
- YouTube動画が再生中。
- Wispr Flowのホットキーが`Ctrl + ]`。
- Typelessは停止中。

**操作手順**
1. `Ctrl + ]`でWispr Flowを開始する。
2. 動画が停止したことを確認する。
3. 400ms以上待って`Ctrl + ]`で終了する。

**期待結果**
- 開始時に動画が停止する。
- 終了時に、同じsessionで拡張機能が停止した動画だけが再生する。

**確認ログ**
- AHK: `hotkey triggered (Wispr Flow). State: ACTIVE`、`state changed: inactive -> active`、`POST /state succeeded`
- Content Script: `[EXT] paused by script sessionId=...`
- 終了時: AHKの`active -> inactive`、Content Scriptの`[EXT] resumed by script sessionId=...`

**失敗時の切り分け**
- AHKログがない: ホットキー登録・AHK起動を確認。
- AHKは成功、Content Scriptログがない: 拡張機能の読み込みと対象タブの再読み込みを確認。
- Backgroundログにfetch失敗: Node.jsと`/health`を確認。

**復旧方法**
- 入力を終了し、AHKと拡張機能を再起動する。状態ずれ時は`/reset`後、動画を手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- ブラウザ / バージョン:
- 結果・ログ:

---

## 2. Typeless開始・終了

**前提条件**
- YouTube動画が再生中。
- Typelessのホットキーが`右Ctrl + 右Shift`。
- Wispr Flowは停止中。

**操作手順**
1. `右Ctrl + 右Shift`を押して離し、Typelessを開始する。
2. 動画停止を確認する。
3. `左Ctrl + 左Shift`を押しても動画状態が変わらないことを確認する。
4. 400ms以上待ち、`右Ctrl + 右Shift`で終了する。

**期待結果**
- 開始時に停止し、終了時に同一sessionで所有している動画だけ再生する。

**確認ログ**
- AHK: `hotkey triggered (Typeless). State: ACTIVE`と終了時の`State: inactive`
- Content Script: `[EXT] paused by script sessionId=...`、`[EXT] resumed by script sessionId=...`

**失敗時の切り分け**
- `右Ctrl + 右Shift`が他アプリ操作としてしか反応しない場合、AHKの`Registered Typeless physical modifier hooks`を確認。
- HTTP / 拡張機能の切り分けはケース1と同じ。

**復旧方法**
- Typelessを終了し、AHK再起動と`/reset`を行う。動画は必要に応じて手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 3. 最初から停止中の動画

**前提条件**
- YouTube動画をユーザー操作で停止済み。
- Typeless / Wispr Flowは停止中。

**操作手順**
1. どちらかの音声入力を開始する。
2. 400ms以上待って終了する。

**期待結果**
- 開始時に所有権を取得しない。
- 終了時に動画を勝手に再生しない。

**確認ログ**
- Content Script: `[EXT] skipped because already paused`
- 終了時に`resumed by script`が出ない。

**失敗時の切り分け**
- 開始前に動画が本当に停止していたか確認。
- 他のYouTube自動再生や別拡張機能による再生を切り分ける。

**復旧方法**
- 動画を手動停止し、拡張機能を再読み込みして再試験する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 4. Pause Guard

**前提条件**
- 再生中動画を音声入力開始で停止できている。

**操作手順**
1. 入力中にYouTubeの再生ボタンまたはスペースキーで再生を試みる。
2. 入力を終了する。

**期待結果**
- 入力中は即時または次回pollで再停止する。
- 入力終了後は条件を満たせば再生する。

**確認ログ**
- `[EXT] play event blocked while active sessionId=...`
- または`[EXT] pause guard reapplied sessionId=...`

**失敗時の切り分け**
- Content Scriptの所有権があるか、開始時に`paused by script`が出たか確認。
- YouTubeのvideo要素変更ログを確認。

**復旧方法**
- 入力終了、ページ再読み込み、拡張機能再読み込み後に再試験する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 5. SPA動画切替

**前提条件**
- 入力開始で動画が停止し、所有権がある。

**操作手順**
1. 入力中のまま、YouTube内リンクで別動画へ移動する。
2. 新しい動画が再生開始した場合の挙動を確認する。
3. 入力を終了する。

**期待結果**
- 新しいvideo要素へlistenerを付け替え、再生中なら停止する。
- 終了時は現在のvideoに対して同一session条件で再生を試みる。

**確認ログ**
- `[EXT] video element changed while active`
- `[EXT] immediate pause applied to new video element sessionId=...`

**失敗時の切り分け**
- ページ全体遷移かSPA遷移か確認。
- 新video出現時に所有権が残っていたか確認。

**復旧方法**
- 入力終了、ページ再読み込み後に新しいsessionで再試験する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 6. TypelessとWispr Flowの重複

**前提条件**
- 両方のアプリが停止中。
- YouTube動画が再生中。

**操作手順**
1. Typelessを開始する。
2. 400ms以上待ち、Wispr Flowも開始する。
3. 動画が停止を維持することを確認する。
4. 最後に両方を終了する。

**期待結果**
- 最初の開始で集約状態がactiveになる。
- 2本目開始でsessionIdを増やさず、停止を維持する。
- 両方終了するまで再生しない。

**確認ログ**
- AHKは最初の開始時だけ`inactive -> active`を記録。
- Bridgeの`sessionId`は重複開始で増えない。

**失敗時の切り分け**
- 各アプリの開始・終了順とAHK内部トグルをログで追う。
- 400ms debounceにより操作が捨てられていないか確認。

**復旧方法**
- 両方を終了し、AHK再起動と`/reset`で初期化する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 7. 一方だけ終了

**前提条件**
- TypelessとWispr Flowが両方active。
- 動画は拡張機能により停止中。

**操作手順**
1. 片方だけ終了する。
2. 動画状態を確認する。
3. 残りも終了する。

**期待結果**
- 片方終了時は集約activeを維持し、動画を再生しない。
- 最後の1本を終了した時点で条件付き再生する。

**確認ログ**
- 片方終了時にAHKの`active -> inactive`が出ない。
- 最後の終了時にだけ`active -> inactive`が出る。

**失敗時の切り分け**
- AHKログで`isTypelessActive` / `isWisprFlowActive`に相当するトグル順を確認。

**復旧方法**
- 両方終了、AHK再起動、`/reset`、必要なら動画を手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 8. 400ms以内の二重押下

**前提条件**
- 両入力アプリが停止中。
- AHKの`DEBOUNCE_MS`が400。

**操作手順**
1. 同じ開始・終了ホットキーを400ms以内に2回押す。
2. AHKログとBridge `/state`を確認する。

**期待結果**
- 2回目は`BLOCKED BY DEBOUNCE`となり、1回目だけトグルされる。
- **開始と終了の両方が成立することは期待しない。** Bridgeはactiveのままになり得る。

**確認ログ**
- `hotkey triggered (...) - BLOCKED BY DEBOUNCE`
- `/state`は1回目に対応する状態。

**失敗時の切り分け**
- 実際の押下間隔が400ms未満か、別ホットキーを押していないか確認。

**復旧方法**
- 400ms以上待って同じホットキーをもう一度押す。ずれた場合はAHK再起動と`/reset`。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 押下間隔:
- 結果・ログ:

---

## 9. Node.js停止

**前提条件**
- 入力開始で動画が停止し、所有権がある。

**操作手順**
1. 通知領域常駐EXEが起動したNode.js HTTP Bridgeだけをタスクマネージャーなどで停止する。
2. 健康確認2回と再起動間隔を含め、最大25秒程度待つ。
3. 待機中に動画が勝手に再生しないことを確認する。
4. `/health`が再び`ok: true`を返し、停止前とは異なるNode.js PIDで復旧したことを確認する。

**期待結果**
- 復旧までの間はBackground Workerのfetchが失敗する。
- Content Scriptは直前のactive状態と所有権を維持し、通信失敗だけで再生しない。
- 連続2回の健康確認失敗後、常駐EXEが所有していたBridgeを新しいPIDで自動起動する。

**確認ログ**
- Background: `[BG] fetch failed ...`
- Content Script: `[EXT] background state request failed ...`

**失敗時の切り分け**
- 本当に対象Node.jsだけを止めたか、別プロセスが同じポートで応答していないか確認。

**復旧方法**
- 自動復旧しない場合は通知領域の`Restart local bridge`を使用する。状態がずれた場合は入力終了後に`Reset dictation state`を実行し、必要なら動画を手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 10. Background Worker通信失敗

**前提条件**
- 入力中で動画が停止中。

**操作手順**
1. 拡張機能のService Workerを停止する、または拡張機能を再読み込みして一時的にContent Scriptとの通信を切る。
2. 動画が勝手に再生しないことを確認する。
3. タブと拡張機能を再読み込みする。

**期待結果**
- `undefined`、`chrome.runtime.lastError`、timeout等でも前回状態・所有権を破壊しない。
- `isRequesting`を解除し、次回poll可能な状態へ戻る。

**確認ログ**
- `[EXT] background request timeout`
- または`[EXT] chrome.runtime.lastError=...`

**失敗時の切り分け**
- Node.js停止との違いを確認する。Backgroundログ自体がない場合はWorker通信側。

**復旧方法**
- 拡張機能とYouTubeタブを再読み込みし、Bridge `/health`を確認する。必要なら動画を手動復旧する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 失敗の作り方:
- 結果・ログ:

---

## 11. 拡張機能無効化

**前提条件**
- 入力中で、拡張機能が動画を停止済み。

**操作手順**
1. 拡張機能管理画面で対象拡張機能を無効化する。
2. 動画状態を確認する。
3. 再度有効化し、YouTubeタブを再読み込みする。

**期待結果**
- 無効化後は新しい制御を行わない。
- 無効化前の停止所有権は復元されず、勝手に再生しない。

**確認ログ**
- 無効化後はContent Script / Backgroundの新規ログが停止する。

**失敗時の切り分け**
- 同名の別拡張機能や古い読み込みが残っていないか確認。

**復旧方法**
- 拡張機能を有効化、タブを再読み込み、実状態を合わせる。停止中動画は手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 12. AHK停止

**前提条件**
- 入力中でBridgeがactive、動画が停止中。

**操作手順**
1. 対象AHKスクリプトだけを終了する。
2. Bridge `/state`と動画状態を確認する。

**期待結果**
- Bridgeは最後のactiveを保持する。
- 動画は停止を維持し得る。AHK停止だけでは自動inactiveにならない。

**確認ログ**
- AHKログが停止する。
- Backgroundは引き続き`active=true`を取得する。

**失敗時の切り分け**
- Bridgeも同時に停止していないか確認。

**復旧方法**
- 実入力を終了、AHK再起動、`/reset`、動画を手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 13. `/reset`

**前提条件**
- 入力中でBridgeがactive、動画が拡張機能により停止中。

**操作手順**
1. `curl.exe -X POST http://127.0.0.1:17654/reset`を実行する。
2. Bridge `/state`、Content Scriptログ、動画状態を確認する。

**期待結果**
- Bridgeは`active=false, sessionId=0`になる。
- Content Scriptは旧sessionとの不一致により所有権を破棄し、勝手に再生しない。
- AHK内部フラグは`/reset`だけでは初期化されない。

**確認ログ**
- Server: `POST /reset`
- Content Script: sessionId不一致により再生をskipするログ、または`skipped resume because no video paused by extension`

**失敗時の切り分け**
- curlが正しいポートへ到達したか確認。
- AHK内部状態とBridge状態を別々に確認。

**復旧方法**
- AHK状態も初期化する場合は、入力を終了して`Ctrl + Alt + R`を押す。動画は必要に応じて手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- reset応答:
- 結果・ログ:

---

## 14. ブラウザ終了・再起動

**前提条件**
- BridgeとAHKが起動中。
- 入力active / inactiveの両パターンで別々に確認する。

**操作手順**
1. ブラウザを完全終了する。
2. ブラウザを再起動し、YouTube動画を開く。
3. inactive時とactive時の初回poll挙動を確認する。

**期待結果**
- Content Script内部所有権は再起動前から引き継がない。
- Bridgeがinactiveなら動画を操作しない。
- Bridgeがactiveなら、再生中動画を新しいactive開始として停止する。

**確認ログ**
- `[EXT] content script loaded`
- 初回stateに応じて`paused by script`または操作なし。

**失敗時の切り分け**
- ブラウザがバックグラウンドに残っていないか、拡張機能が読み込まれたか確認。

**復旧方法**
- 入力を終了、AHK再起動、`/reset`、タブ再読み込みを行う。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- active / inactive条件:
- 結果・ログ:

---

## 15. `stop.bat`

**前提条件**
- `start.bat`で起動したNode.jsとAHKが動作中。
- 可能なら入力inactiveで実施する。

**操作手順**
1. `stop.bat`を実行する。
2. 対象Node.jsと対象AHKが終了したことを確認する。
3. `/health`が応答しないことを確認する。

**期待結果**
- PID記録されたこのツールのプロセスだけが停止する。
- `[SUCCESS] Stop command completed.`が表示される。

**確認ログ**
- `scripts/windows/stop-tracked-processes.ps1`の対象PID処理結果。
- `runtime`内の対象PIDファイルが処理される。

**失敗時の切り分け**
- PIDファイルの内容、対象プロセスのコマンドライン、PowerShellの終了コードを確認。

**復旧方法**
- 残存対象プロセスだけを確認して停止する。再起動は`start.bat`。active中に止めた場合、動画は手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 結果・ログ:

---

## 16. 他のAHKプロセスを停止しない

**前提条件**
- このツールとは無関係なAHKスクリプトを1本起動する。
- このツールも`start.bat`で起動する。

**操作手順**
1. 両方のAHK PIDを記録する。
2. `stop.bat`を実行する。
3. 無関係なAHKが継続動作していることを確認する。

**期待結果**
- `runtime/youtube-dictation-ahk.pid`に記録された対象だけ停止する。
- 無関係なAHKプロセスは停止しない。

**確認ログ**
- stopスクリプトの対象PID。
- 実行前後のAHKプロセス一覧。

**失敗時の切り分け**
- PIDファイルが古くないか、無関係AHKのPIDと一致していないか確認。

**復旧方法**
- 誤停止したAHKを再起動し、PIDファイル生成経路を調査する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 対象PID / 無関係PID:
- 結果・ログ:

---

## 17. 録音状態と内部状態がずれた場合

**前提条件**
- AHKは音声入力アプリの録音APIを読まず、ホットキーをトグルとして推定する仕様を理解している。

**操作手順**
1. 音声入力をホットキーで開始する。
2. ホットキー以外のUI操作で録音を終了する、または意図的にホットキーを取りこぼす。
3. AHKログ、Bridge `/state`、実録音状態を比較する。

**期待結果**
- ずれは自動検出・自動補正されない。
- 動画が停止を維持する、または実録音中に再生する可能性があることを確認する。

**確認ログ**
- AHKの最後のトグル状態。
- `/state`の`active`と実アプリ録音表示の不一致。

**失敗時の切り分け**
- これは既知制限の再現であり、自動復旧成功を期待しない。

**復旧方法**
- 両アプリを完全終了し、AHK再起動、`/reset`、動画手動復旧を行う。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- ずれの作り方:
- 結果・ログ:

---

## 18. sessionId不一致

**前提条件**
- 実ブラウザでactive中の所有権を作る。
- DevToolsまたはHTTP操作で、BridgeのsessionIdが異なる状態を再現できること。

**操作手順**
1. session 1相当で動画を停止する。
2. Content Scriptが保持するIDと異なるsessionIdのactiveまたはinactive stateを返す状況を作る。
3. その後も数回pollさせる。

**期待結果**
- 所有権を安全に破棄する。
- 不一致時も後続poll時も動画を勝手に再生しない。

**確認ログ**
- active不一致時: `[EXT] active sessionId mismatch expected=... received=...; ownership discarded`
- inactive不一致時: `[EXT] skipped resume because no video paused by extension`

**失敗時の切り分け**
- 実際に異なるIDがContent Scriptへ届いたかBackgroundログで確認。

**復旧方法**
- 実録音状態を確認し、AHK再起動と`/reset`を行う。動画は手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 再現したID:
- 結果・ログ:

---

## 19. `video.play()`拒否

**前提条件**
- ブラウザの自動再生制限等で`video.play()`をrejectさせる再現方法を用意する。
- 入力開始で拡張機能が動画を停止済み。

**操作手順**
1. 入力終了時の`video.play()`を拒否させる。
2. 未処理例外が残らないことを確認する。
3. ユーザー操作で動画を再生し、次のsessionを開始・終了する。

**期待結果**
- 最初の終了ではエラーを記録し、所有権を解放する。
- 次のsessionでは停止・条件付き再生が正常に行える。

**確認ログ**
- `[EXT] failed to play video:`
- 次sessionの`paused by script sessionId=...`と`resumed by script sessionId=...`

**失敗時の切り分け**
- rejectが本当に発生したかDevToolsで確認。
- 次session開始前にユーザー操作で動画を再生したか確認。

**復旧方法**
- ユーザー操作で再生し、拡張機能・タブを再読み込みして再試験する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- 拒否の再現方法:
- 結果・ログ:

---

## 20. 状態同期リセットホットキー

**前提条件**
- Typeless / Wispr Flowを実際には停止している。
- AHK内部状態を意図的にactiveへずらし、Bridge `/state`が`active=true`であることを確認する。
- YouTube動画がこのツールにより停止中である。

**操作手順**
1. `Ctrl + Alt + R`を押す。
2. Bridge `/state`、`logs/control.log`、動画状態を確認する。
3. 通常の音声入力ホットキーを1回押す。

**期待結果**
- リセット時にAHKのTypeless・Wispr Flow・集約状態がinactiveへ戻る。
- Bridgeへ`active=false`が送られる。
- 同一sessionでこのツールが停止した動画は再生を試みる。
- 次の通常ホットキー1回目が開始扱いとなり、再生中動画を停止する。

**確認ログ**
- AHK: `manual state reset: all dictation states -> inactive`
- AHK: `POST /state sending: active=false`と`POST /state succeeded`
- Server: `POST /state active=false`
- 次の通常ホットキーで`state changed: inactive -> active`

**失敗時の切り分け**
- リセットログがない: `resetHotkey`設定、AHK再起動、ホットキー競合を確認する。
- AHKログはあるがBridgeがactiveのまま: `/health`とPOST失敗ログを確認する。
- 動画が再生しない: Content Scriptの所有権、sessionId、`video.play()`拒否を確認する。

**復旧方法**
- 入力アプリを停止し、AHKとNode.jsを再起動してから再度`Ctrl + Alt + R`を押す。動画は必要に応じて手動再生する。

**実施結果欄**
- 状態: 未実施
- 実施日時:
- ブラウザ / バージョン:
- 結果・ログ:
