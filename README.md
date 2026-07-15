# YouTube Dictation Pause Control

[![CI](https://github.com/misaka310/youtube-dictation-pause-control/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/misaka310/youtube-dictation-pause-control/actions/workflows/ci.yml)

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
├── config/              設定例。settings.json はローカル専用でGit管理外
├── extension/           Brave / Chromium 拡張機能 Manifest V3
├── server/              127.0.0.1 専用のNode.js HTTP Bridge
├── docs/                手動E2E確認、旧方式の検討メモ
├── logs/                実行時ログ。*.log はGit管理外
├── scripts/windows/     自動起動などの補助スクリプト
├── start.bat            手動起動
└── stop.bat             このツールが起動したプロセスだけ停止
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
- Node.js 22以上

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

### 状態が逆になったとき

Typeless / Wispr Flowを実際に停止してから `Ctrl + Alt + R` を押します。AHK内部のTypeless・Wispr Flow・集約状態とdebounce時刻をinactiveへ戻し、HTTP Bridgeにもinactiveを送ります。次の通常ホットキー押下が開始扱いに戻ります。

このリセットは音声入力アプリ本体を停止しません。録音中のまま押すと再び実状態とずれるため、必ず入力を終了してから使用してください。

## 自動起動

登録:

```cmd
scripts\windows\setup-autostart.bat
```

解除:

```cmd
scripts\windows\remove-autostart.bat
```

停止:

```cmd
stop.bat
```

自動起動はユーザーのスタートアップフォルダを使います。管理者権限は不要です。
`stop.bat` は `runtime/*.pid` を使って対象プロセスを停止します。PID記録から漏れた同じ `youtube-dictation-control.ahk` だけはコマンドラインを照合して停止し、別のAutoHotkeyスクリプトは停止しません。起動時にも同じ照合を行い、二重起動を防ぎます。

## 設定

初回だけ `config/settings.example.json` をコピーして `config/settings.json` を作ります。`settings.json` はローカル専用でGit管理外です。

```cmd
copy config\settings.example.json config\settings.json
```

その後、`config/settings.json` を編集します。初期値は `config/settings.example.json` と同じです。

```json
{
  "port": 17654,
  "pollingIntervalMs": 500,
  "typelessHotkey": "Ctrl+Shift",
  "wisprFlowHotkey": "Ctrl+]",
  "resetHotkey": "Ctrl+Alt+R",
  "autoStartServer": true,
  "debugMode": false
}
```

| Key | Meaning |
|---|---|
| `port` | ローカルHTTP Bridgeの待受ポート。標準運用は17654固定です。変更する場合は設定だけでなく、拡張機能・起動・停止スクリプト内の17654もすべて合わせる必要があります |
| `pollingIntervalMs` | 互換用の設定値です。現行Content Scriptの状態取得間隔は500ms固定で、この値は反映されません |
| `typelessHotkey` | Typeless用ホットキー |
| `wisprFlowHotkey` | Wispr Flow用ホットキー |
| `resetHotkey` | AHK内部状態とHTTP Bridgeをinactiveへ同期する復旧用ホットキー。音声入力アプリを停止してから使用します |
| `autoStartServer` | AHK起動時にサーバー未起動なら起動するか |
| `debugMode` | AHK側の状態表示ToolTipを出すか |

## テスト

Node.jsだけで回帰テストを実行できます。BraveやAutoHotkeyは使いません。

```cmd
npm test
```

`npm test` は合計83ケースを確認します。

- 構文・JSONチェック: 11ケース（JSON 2、JavaScript 9）
- HTTP API: 14ケース（`/health`、`/state`、`/reset`、CORS、異常入力）
- Content Script: 28ケース（状態遷移、所有権、通信失敗、不正state、多重poll、再生拒否）
- Background Worker: 15ケース（本番listener境界、HTTP異常、timeout、不正JSON、送信例外）
- Runtime復旧: 15ケース（ログ競合リトライ4、AHKリセット・二重起動防止・停止復旧契約11）

個別実行もできます。

```cmd
npm run check
npm run test:api
npm run test:extension
npm run test:background
npm run test:runtime
```

GitHub ActionsはWindowsとNode.js 22で同じテストをpushとpull requestごとに実行します。実ブラウザとAutoHotkeyを使う確認は自動テストに含まれないため、[docs/state-behavior.md](docs/state-behavior.md) と [docs/e2e-checklist.md](docs/e2e-checklist.md) の手順で確認してください。

## プライバシーとセキュリティ

- 外部サーバーへデータを送信しません。
- ローカルHTTPサーバーは `127.0.0.1` のみにバインドします。
- APIキー、OAuthトークン、認証情報は使いません。
- 実行時ログは `logs/control.log` に出ますが、`.gitignore` によりGit管理外です。
- 実行時PIDは `runtime/` に出ますが、`.gitignore` によりGit管理外です。
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
