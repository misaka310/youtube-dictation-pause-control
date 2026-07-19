# 状態・復旧仕様

AutoHotkey v2がTypeless / Wispr Flowのホットキーをトグルとして推定し、ChatGPT Local Voice Bridgeは右Ctrlと右Shift左の`＼ / _`キーを押している間だけactiveとして、ローカルHTTP Bridgeへ集約状態を送ります。Background Workerは`GET_STATE`ごとに`http://127.0.0.1:17654/state`を取得し、Content Scriptは500ms間隔で状態を反映します。

## 判定ラベル

- **自動テスト済み**: Node.js上の偽Chrome API・偽video・実HTTP Bridgeで確認済み。
- **自動契約テスト済み**: AHKソースの必須処理と設定を検査し、AutoHotkey v2の`/Validate`で構文確認済み。実キー操作は手動確認が必要です。
- **手動確認が必要**: 実ブラウザ、実YouTube、実AutoHotkey、実音声入力アプリでの確認が必要。
- **既知の制限**: 現在の実装では保証できない、または自動復旧しない。
- 今回の更新では実ブラウザE2Eを実施していません。手動欄が「未実施」の項目を実機確認済みとして扱わないでください。

## 実運用表

| 条件・操作 | 内部状態 | 期待動作 | 自動テスト | 手動確認 | 復旧方法 | 制限 |
|---|---|---|---|---|---|---|
| inactive → active | HTTP Bridgeが`sessionId`を1増加。Content Scriptが`lastStateActive=true`、再生中なら`isPausedByMe=true` | 再生中の動画を1回停止し、そのsessionの所有権を記録 | 自動テスト済み: API / Content Script | 未実施。実YouTubeで必要 | 入力終了ホットキーを押す | ホットキーが音声入力開始と一致した場合だけ正しい |
| active → active | `sessionId`は維持。所有権も維持 | 既に停止中なら重複停止しない。再生へ戻ればPause Guardで再停止 | 自動テスト済み | 未実施 | 入力終了後も停止中なら手動再生 | すべてのYouTube UI状態で停止維持を保証しない |
| active → inactive | 同一`sessionId`なら所有権を解放 | この拡張機能が同じsessionで停止した動画だけ`play()`する | 自動テスト済み | 未実施 | `play()`失敗時は手動再生 | sessionId不一致時は安全側で再生しない |
| inactive → inactive | 所有権なし | 動画を操作しない | 自動テスト済み: 初期inactive | 未実施 | 不要 | なし |
| 400ms以内の二重押下 | AHKの同一ホットキー用debounceが2回目を破棄 | 1回目だけトグルし、2回目は`BLOCKED BY DEBOUNCE` | 自動テストなし | 未実施 | 入力アプリを停止して`Ctrl + Alt + R`を押す | **短い開始・終了を両方処理する仕様ではない**。400ms未満で終了するとAHK状態がactiveのままになる |
| 最初から動画が停止中 | activeになるが所有権は取得しない | 入力終了時も再生しない | 自動テスト済み | 未実施 | 必要ならユーザーが再生 | なし |
| 入力中の手動再生 | `lastStateActive=true`かつ所有権あり | `play`イベントまたは次回pollで再停止 | 自動テスト済み | 未実施 | 入力終了後に再生 | 所有権がない動画は止めない |
| Pause Guard | 所有権とsessionId一致時だけ有効 | 再生復帰を検出して再停止 | 自動テスト済み | 未実施 | 拡張機能再読み込み後に再試行 | ブラウザやYouTubeの変更に依存 |
| SPA動画切替 | video要素を付け替える。activeかつ所有権ありなら新要素へ継続 | 新しい再生中videoを停止 | 自動テスト済み | 未実施 | ページ再読み込み、拡張機能再読み込み | active開始時にvideoがなく所有権を得ていない場合、後から現れたvideoは自動停止しない |
| video要素なし | activeSessionIdは保持するが所有権は取得しない | 例外を出さず何もしない | 自動テスト済み | 未実施 | video表示後に入力を一度終了し、再開始 | 後からvideoが現れても、そのsessionでは所有権なしのため停止しない |
| タブを閉じる | そのタブのContent Script状態は破棄 | 閉じたタブへの再生操作は行わない | 自動テストなし | 未実施 | 新しいYouTubeタブで入力状態を確認 | 閉じる直前に停止した動画を自動復旧できない |
| ブラウザを閉じる | Content Script / Background Workerは終了。HTTP BridgeとAHKは別プロセス | ブラウザ外の状態は保持され得る | 自動テストなし | 未実施 | 入力を終了し、状態ずれなら`Ctrl + Alt + R`後に再起動 | 閉じる直前の動画状態は自動復旧しない |
| ブラウザ再起動 | Content Script内部状態は初期化し、Bridgeの現在値を新規取得 | Bridgeがactiveなら再生中動画を停止。inactiveなら操作しない | 自動テストなし | 未実施 | BridgeとAHKの状態を確認し、ずれなら入力終了後に`Ctrl + Alt + R` | 前回の停止所有権は引き継がない |
| Typelessのみ | `isTypelessActive`をトグル。OR集約がactive/inactiveへ遷移 | 開始で停止、終了で条件付き再生 | 自動テストなし | 未実施 | 状態ずれ時はTypelessを終了して`Ctrl + Alt + R` | Typeless本体の録音状態は読まず、ホットキーだけで推定 |
| Wispr Flowのみ | `isWisprFlowActive`をトグル | 開始で停止、終了で条件付き再生 | 自動テストなし | 未実施 | 状態ずれ時はWispr Flowを終了して`Ctrl + Alt + R` | Wispr Flow本体の録音状態は読まない |
| Local Voice Bridgeのみ | 右Ctrlと`VK_OEM_102`が両方押されている間だけ`isVoiceBridgeActive=true` | 押下中に停止し、どちらかを離すと条件付き再生 | 自動契約テスト済み | 未実施 | 2キーを離して`Ctrl + Alt + R` | 20msごとの物理キー状態監視。録音APIは参照しない |
| 複数入力の同時使用 | 3つの真偽値をOR集約 | 最初の開始で停止し、すべて終了まで再生しない | 自動契約テスト済み | 未実施 | すべての入力を終了して`Ctrl + Alt + R` | Typeless / Wispr Flowの実録音状態とは同期しない |
| 一部だけ終了 | 残りの入力がactiveのため集約activeを維持 | 動画を再生しない | 自動契約テスト済み | 未実施 | 残りの入力も終了する | トグル式入力はホットキー取りこぼしで判定が逆転し得る |
| すべて終了 | OR集約がfalseになりBridgeへinactive送信 | 同一sessionで所有していた動画だけ再生 | 自動契約テスト済み | 未実施 | 再生拒否時は手動再生 | トグル式入力の内部フラグがずれると終了しない |
| Node.js停止 | Background fetch失敗。Content Scriptは直前状態・所有権を維持 | 通信失敗だけで勝手に再生しない | 自動テスト済み: fetch例外・timeout・`success:false` | 未実施 | Node.js再起動後、入力を終了して`Ctrl + Alt + R` | AHKが停止中にinactive送信へ失敗すると、再起動後に自動再送されない |
| Background Worker通信失敗 | Content Scriptのrequestが失敗し`isRequesting`を解除 | 前回状態と所有権を維持し、次pollで再試行 | 自動テスト済み: undefined / lastError / timeout / 同期例外 | 未実施 | 拡張機能を再読み込みし、Bridge `/health`を確認 | 失敗中は開始・終了の新状態を反映できない |
| Content Script停止 | そのタブのpollとPause Guardが停止 | 動画へ新しい操作をしない | 自動テストなし | 未実施 | タブ再読み込みまたは拡張機能再読み込み | 停止前に一時停止した動画を自動再開しない |
| 拡張機能無効化 | Background Worker / Content Script終了 | 以後YouTubeを制御しない | 自動テストなし | 未実施 | 拡張機能を有効化し、ページ再読み込み | 無効化前の所有権は失われるため自動再生復旧しない |
| AutoHotkey停止 | Bridgeは最後に受信した状態を保持 | activeなら拡張機能は停止維持を続ける | 自動テストなし | 未実施 | AHK再起動後、入力アプリを停止して`Ctrl + Alt + R` | AHK再起動だけではBridgeのactiveを自動解除しない |
| ホットキー取りこぼし | AHK内部フラグが実録音状態とずれる | 実装はずれを自動検出できない | 自動テストなし | 未実施 | 両アプリを終了し、`Ctrl + Alt + R`を押す | 既知の制限 |
| ホットキー以外の方法で音声入力が終了 | AHKは終了を検知せずactiveのまま | 動画は停止維持され得る | 自動テストなし | 未実施 | 入力アプリが停止済みであることを確認し、`Ctrl + Alt + R` | 既知の制限 |
| 実録音状態とAHK内部状態のずれ | Bridgeへ誤ったactive/inactiveが送られる | 自動補正しない | 自動テストなし | 未実施 | 全入力を終了して`Ctrl + Alt + R`、必要なら動画を手動復旧 | 実録音APIを参照しない設計上の制限 |
| `Ctrl + Alt + R`状態同期リセット | AHKのTypeless・Wispr Flow・Local Voice Bridge・集約状態をfalse、debounce時刻を0へ戻し、Bridgeへinactiveを送信 | 次の通常ホットキーまたは長押しが開始扱いに戻る。所有権とsessionIdが一致すれば停止中動画の再生も試みる | 自動契約テスト済み: 24ケース、AHK構文確認済み | 未実施 | 入力アプリを停止し、Local Voice Bridgeの2キーを離してから押す | 音声入力アプリ本体の録音は停止しない。録音中に押すと再びずれる |
| sessionId不一致 | inactive不一致またはactive中のID変化で所有権を破棄 | 以後のpollでも勝手に再生しない | 自動テスト済み: inactive不一致 / active不一致 | 未実施 | 実状態を確認し、必要なら動画を手動再生 | 安全側のため自動再開しない |
| 不正state | `lastStateActive`、所有権、sessionを変更しない | 不正値を無視し、次の正常stateで復帰 | 自動テスト済み: active型、sessionId型、負数、欠落 | 未実施 | Bridge再起動または拡張機能再読み込み | 不正が続く間は状態更新できない |
| `video.play()`拒否 | 再生所有権を解放し、エラーを記録 | 未処理例外を出さず動画は停止のまま | 自動テスト済み。次sessionの停止・再開も確認 | 未実施 | ユーザー操作で再生し、次sessionを開始 | ブラウザの自動再生制限は回避しない |
| 再生処理中の新session開始 | `resumeInFlight=true`。新sessionへ所有権を移す | 遅れて再生完了しても再停止 | 自動テスト済み | 未実施 | 通常どおり新sessionを終了 | 実ブラウザのPromiseタイミングは手動確認が必要 |
| `POST /reset` | Bridgeを`active=false, sessionId=0`へ初期化 | APIは初期化成功。Content Script側に旧session所有権があればID不一致で再生せず破棄 | 自動テスト済み: API resetと次session=1 | 未実施 | AHK状態もずれている場合は、入力を終了して`Ctrl + Alt + R`を使用 | `/reset`だけではAHK内部フラグを初期化しない |
| Node.jsとAHKの同時ログ追記 | 両方が`logs/control.log`へ書く。`EBUSY` / `EACCES` / `EPERM`時は短時間リトライ | 短いファイルロックで長いスタックトレースを出さず、最大5回まで追記を再試行 | 自動テスト済み: 4ケース。AHK構文確認済み | 未実施 | ログを開くアプリを閉じ、必要ならサービス再起動 | ロックがリトライ期間を超える場合、その1行を省略して短い警告だけ表示する |
| ツール再起動 | Node状態は初期値、AHK内部状態はfalseから開始 | 新しい開始イベントから動作 | 自動テストなし | 未実施 | 入力アプリを終了してから再起動し、必要なら`Ctrl + Alt + R` | 再起動前の動画所有権は復元しない |
| `stop.bat` | NodeはPIDと検証済みポート、AHKはPIDと同一スクリプトのコマンドラインを照合 | このツールの対象プロセスだけ終了 | 自動契約テスト済み: AHK照合 | 未実施 | 再開は`start.bat`。停止中の動画は手動再生 | active中に停止するとContent Scriptは通信失敗時の安全側で停止・所有権を維持し、自動再開しない |
| 他のAHKプロセスが起動中 | PID記録に加え、コマンドラインに`youtube-dictation-control.ahk`を含む同一スクリプトだけを照合 | 起動時と停止時に古い同一スクリプトを終了し、別のAHKスクリプトは停止しない | 自動契約テスト済み | 未実施 | 誤停止があればコマンドライン照合条件を確認 | 同名スクリプトを別場所で同時利用する運用は区別しない |

## CORSと通信境界

- HTTP Bridgeは`127.0.0.1`だけで待ち受けます。
- `Origin`なしのローカルクライアントを許可します。
- CORS付きブラウザ要求は`chrome-extension://`または`moz-extension://`で始まるOriginだけを許可します。
- 現在のContent ScriptはHTTP Bridgeへ直接fetchせず、Background Workerへ`GET_STATE`を送り、Background WorkerだけがHTTP Bridgeへfetchします。
- CORSは認証ではありません。同一PC上で`Origin`ヘッダーを付けないローカルプロセスはAPIへ到達できます。ポートを外部公開しないでください。
