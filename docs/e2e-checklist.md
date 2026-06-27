# E2E 手動確認チェックリスト (YouTube Dictation Pause Control - HTTP Bridge + BG Proxy + Pause Guard版)

## 1. 事前準備 (HTTP Bridge セットアップ)

1. **AutoHotkey v2 のインストール**
   - パソコンに AutoHotkey v2 がインストールされているか確認してください。インストールされていない場合は、[公式サイト](https://www.autohotkey.com/) から必ずインストールしてください。
2. **Node.js のインストール**
   - パソコンに Node.js がインストールされているか確認してください。コマンドプロンプトで `node -v` を実行してバージョンが表示されればOKです。
3. **Brave 拡張機能の読み込み**
   - Braveの `brave://extensions` でデベロッパーモードをONにし、「パッケージ化されていない拡張機能を読み込む」から `extension` フォルダを選択します。
4. **レジストリ登録・ブラウザ再起動の不要化**
   - **重要**: 旧方式（Native Messaging）と異なり、Windowsレジストリ登録や、ブラウザの完全再起動は**一切不要**です。
5. **サービスの起動**
   - プロジェクトのルートディレクトリにある `start.bat` をダブルクリックして起動します。これにより、Node.js サーバーと AutoHotkey スクリプトが両方立ち上がります。

---

## 2. ログを用いた全ライフサイクル動作検証（実機での確認方法）

GUI操作中に正しく動作しているか、あるいはどこで止まっているかを切り分けるために、システムログファイル `logs/control.log` (自動生成) をエディタ等で開いた状態で以下のテストを行ってください。
また、YouTubeを開いているBraveタブの DevTools コンソール (F12 -> コンソール) も合わせて確認してください。

### テストケース 1: Wispr Flow (Ctrl + ]) による一時停止・再開テスト
- **手順**:
  1. BraveでYouTube動画を**再生中**にします。
  2. `Ctrl + ]` を押します（音声入力開始）。YouTube動画が一時停止することを確認します。
  3. 数秒待ってから、もう一度 `Ctrl + ]` を押します（音声入力終了）。YouTube動画が自動で再開することを確認します。
- **期待されるログ出力**:
  正しく動作している場合、`logs/control.log` に以下のような一連のライフサイクルログが順番に出力されます。
  
  ```
  [AHK] hotkey triggered (Wispr Flow). State: ACTIVE
  [AHK] state changed: inactive -> active
  [AHK] POST /state sending: active=true
  [SERVER] POST /state active=true
  [SERVER] state changed inactive -> active
  [AHK] POST /state succeeded
  
  (音声入力終了時...)
  
  [AHK] hotkey triggered (Wispr Flow). State: inactive
  [AHK] state changed: active -> inactive
  [AHK] POST /state sending: active=false
  [SERVER] POST /state active=false
  [SERVER] state changed active -> inactive
  [AHK] POST /state succeeded
  ```

  **Brave YouTubeページ（Content Script）デベロッパーコンソール (`console.log`) 側**:
  直接 localhost を fetch せず、バックグラウンド経由でメッセージを安全に取得しています。
  ```
  [EXT] content script loaded
  [EXT] requesting state via background
  [EXT] received state active=true, sessionId=1
  [EXT] transition inactive -> active
  [EXT] video found paused=false
  [EXT] paused by script sessionId=1
  
  (音声入力終了時...)
  
  [EXT] requesting state via background
  [EXT] received state active=false, sessionId=1
  [EXT] transition active -> inactive
  [EXT] video found
  [EXT] resumed by script sessionId=1
  ```

### テストケース 2: YouTube側による自動再生復帰（Pause Guard）の確認テスト
録音開始後に動画が勝手に再生状態に戻ってしまった場合、自動で再停止されるか（Pause Guard）をテストします。

- **手順**:
  1. YouTube動画を再生し、`Ctrl + ]` を押して一時停止させます（録音開始）。
  2. 録音状態（一時停止中）のまま、YouTubeの画面をクリックするか、キーボードのスペースキーを押して**手動で動画を再生状態に戻します**。
  3. **動画が即座に（0.5秒以内に）自動的に再一時停止されること**を確認します。
  
- **期待されるログ出力 (ブラウザのコンソール)**:
  ```
  [EXT] requesting state via background
  [EXT] received state active=true, sessionId=1
  [EXT] pause guard reapplied sessionId=1
  ```

### テストケース 3: 重複セッション（Typeless & Wispr Flow）による一時停止・再開テスト
音声入力が重なり合った場合に、YouTubeが途中で再開しないことを確認するテストです。

- **手順**:
  1. BraveでYouTube動画を**再生中**にします。
  2. Typeless を起動します（`Ctrl + Shift` 押下後、キーを離す）。
     - YouTube が一時停止することを確認。
  3. その状態のまま、Wispr Flow を起動します（`Ctrl + ]` 押下）。
     - YouTube は一時停止状態を維持することを確認。
  4. Typeless を終了します（`Ctrl + Shift` 押下後、キーを離す）。
     - YouTube は**再開せず一時停止のまま**であることを確認。
  5. Wispr Flow を終了します（`Ctrl + ]` 押下）。
     - YouTube が**再開**することを確認。

---

## 3. 自動起動および各種バッチファイルの動作検証

本バージョンで追加された各種ユーティリティバッチが期待通りに動作するかを確認します。

### ① `setup-autostart.bat` の動作テスト
- **手順**:
  1. `setup-autostart.bat` をダブルクリックして起動します。
  2. コマンドプロンプトに `[SUCCESS] Autostart registered successfully!` と表示されることを確認します。
  3. キーボードで `Win + R` を押し、`shell:startup` と入力して Enter を押します（スタートアップフォルダが開きます）。
  4. フォルダ内に `YouTubeDictationPause.lnk` というショートカットが存在することを確認します。

### ② `remove-autostart.bat` の動作テスト
- **手順**:
  1. `remove-autostart.bat` をダブルクリックして起動します。
  2. コマンドプロンプトに `[SUCCESS] Autostart shortcut successfully removed.` と表示されることを確認します。
  3. スタートアップフォルダから `YouTubeDictationPause.lnk` が削除されていることを確認します。

### ③ `stop.bat` の動作テスト
- **手順**:
  1. サービスが起動している状態で `stop.bat` をダブルクリックします。
  2. AHK（タスクトレイの「H」アイコン）および Node.js サーバーが正常に終了し、プロンプトに `[SUCCESS] All services stopped successfully!` と表示されることを確認します。
