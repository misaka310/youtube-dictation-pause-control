# YouTube Dictation Pause Control

Windowsで音声入力中だけYouTubeを自動一時停止するローカル補助ツールです。Typeless または Wispr Flow のホットキーを AutoHotkey v2 で検知し、Brave の YouTube タブだけを拡張機能から制御します。

## できること

- 音声入力開始時に、再生中だったYouTube動画を一時停止します。
- 音声入力終了時に、このツールが一時停止した動画だけを再開します。
- YouTubeのSPA遷移やContent Scriptの二重ロードに備えたガードを入れています。
- 録音中に対象動画が再生へ戻った場合、Pause Guard が再度一時停止を試みます。
- Windowsログイン時の自動起動をユーザー権限だけで登録できます。

## 仕組み

```text
youtube-dictation-pause/
├── ahk/                 AutoHotkey v2: ホットキー検知と状態送信
├── config/              ポート、ホットキー、デバッグ設定
├── extension/           Brave / Chromium 拡張機能 Manifest V3
├── server/              127.0.0.1 専用のNode.js HTTP Bridge
├── docs/                手動E2E確認、旧方式の検討メモ
├── logs/                実行時ログ。*.log はGit管理外
├── start.bat            手動起動
├── start-background.bat 自動起動向けの静音起動
├── setup-autostart.bat  Windowsログイン時の自動起動登録
├── remove-autostart.bat 自動起動解除
└── stop.bat             関連プロセス停止
```

通信経路は次の通りです。

```text
Typeless / Wispr Flow hotkey
  -> AutoHotkey v2
  -> Node.js local HTTP bridge on 127.0.0.1
  -> Brave extension background service worker
  -> YouTube content script
  -> video.pause() / video.play()
```

## 必要なもの

- Windows 10 / 11
- Brave Browser または Chromium系ブラウザ
- AutoHotkey v2
- Node.js 16以上

## セットアップ

### 1. 拡張機能を読み込む

1. Braveで `brave://extensions` を開きます。
2. デベロッパーモードをオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」から、このリポジトリの `extension` フォルダを選びます。

### 2. サービスを起動する

リポジトリ直下の `start.bat` をダブルクリックします。

起動時に次を実行します。

- AutoHotkey v2 の場所を検出
- AHKスクリプトの構文チェック
- Node.jsローカルHTTPサーバーの起動
- `/health` による起動確認
- AHKスクリプトの起動

### 3. 動作確認

1. BraveでYouTube動画を再生します。
2. `Ctrl + ]`（Wispr Flow）または `Ctrl + Shift`（Typeless）を押して音声入力を開始します。
3. 動画が一時停止することを確認します。
4. 同じホットキーでもう一度終了し、動画が再開することを確認します。

詳細な手動確認は `docs/e2e-checklist.md` を見てください。

## 自動起動

登録:

```cmd
setup-autostart.bat
```

解除:

```cmd
remove-autostart.bat
```

停止:

```cmd
stop.bat
```

自動起動はユーザーのスタートアップフォルダを使います。管理者権限は不要です。

## 設定

`config/settings.json` を編集します。初期値は `config/settings.example.json` と同じです。

```json
{
  "port": 17654,
  "pollingIntervalMs": 500,
  "typelessHotkey": "Ctrl+Shift",
  "wisprFlowHotkey": "Ctrl+]",
  "autoStartServer": true,
  "debugMode": false
}
```

| Key | Meaning |
|---|---|
| `port` | ローカルHTTP Bridgeの待受ポート。既定値以外に変える場合は `config/settings.json`、`extension/background.js`、`extension/manifest.json` を合わせて変更します |
| `pollingIntervalMs` | AHK側の状態確認間隔。通常は500msで十分です |
| `typelessHotkey` | Typeless用ホットキー |
| `wisprFlowHotkey` | Wispr Flow用ホットキー |
| `autoStartServer` | AHK起動時にサーバー未起動なら起動するか |
| `debugMode` | AHK側の状態表示ToolTipを出すか |

## テスト

Node.jsだけでAPI smoke testを実行できます。

```cmd
npm test
```

このテストは一時ポートで `server/server.js` を起動し、`/health`、`/state`、`/reset` の基本動作を確認します。BraveやAutoHotkeyは使いません。

## プライバシーとセキュリティ

- 外部サーバーへデータを送信しません。
- ローカルHTTPサーバーは `127.0.0.1` のみにバインドします。
- APIキー、OAuthトークン、認証情報は使いません。
- 実行時ログは `logs/control.log` に出ますが、`.gitignore` によりGit管理外です。
- ローカルポートを外部ネットワークへ公開しないでください。
- CORSは拡張機能Origin向けに制限しています。

詳しくは `SECURITY.md` を見てください。

## 制限

- YouTube側のDOM変更やブラウザ仕様変更で動作しなくなる場合があります。
- 拡張機能が読み込まれていないタブは制御できません。
- このツールが一時停止していない動画は、終了時に再開しません。
- Pause Guard は再生復帰の抑制を試みますが、すべてのYouTube UI状態で完全な停止維持を保証するものではありません。
- Typeless / Wispr Flow 本体の録音状態を直接取得しているわけではなく、ホットキー押下を状態トグルとして扱います。

## 旧方式について

Native Messaging を使う案は、レジストリ・絶対パス・Service Worker寿命の扱いが複雑だったため採用していません。検討記録は `docs/legacy-native-messaging.md` に残しています。

## License

MIT License. See `LICENSE`.
