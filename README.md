# YouTube Dictation Pause Control

[![CI](https://github.com/misaka310/youtube-dictation-pause-control/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/misaka310/youtube-dictation-pause-control/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/misaka310/youtube-dictation-pause-control)](https://github.com/misaka310/youtube-dictation-pause-control/releases/latest)

Windowsで音声入力中だけYouTubeを自動一時停止するローカル補助ツールです。Typeless または Wispr Flow のホットキーを通知領域常駐EXEで検知し、BraveのYouTubeタブだけを拡張機能から制御します。

配布版の`YouTubeDictationControl.exe`にはAutoHotkey v2ランタイムが組み込まれているため、利用者がAutoHotkeyを別途インストールする必要はありません。

## 動作デモ

https://github.com/user-attachments/assets/a8541fb9-1728-41ec-9533-6d8fb5dd342b

上の動画は、`Ctrl + ]`で音声入力を開始すると動画が停止し、もう一度押して終了すると再開する流れを説明するデモです。画面は操作説明用に作成したUIです。

## できること

- 音声入力開始時に、再生中だったYouTube動画を一時停止します。
- 音声入力終了時に、このツールが一時停止した動画だけを再開します。
- 録音中に動画が再生へ戻った場合、Pause Guardが再度一時停止を試みます。
- YouTubeのSPA遷移やContent Scriptの二重ロードに備えたガードがあります。
- 通知領域に常駐し、ターミナルを開いたままにしません。
- Node.jsローカルBridgeが終了した場合、状態確認後に自動復旧します。
- Windowsログイン時の自動起動を、通知領域メニューからユーザー権限だけで設定できます。

## 仕組み

```text
Typeless / Wispr Flow hotkey
  -> YouTubeDictationControl.exe（AutoHotkey v2ランタイム内蔵）
  -> Node.js local HTTP bridge on 127.0.0.1
  -> Brave / Chromium extension background service worker
  -> YouTube content script
  -> video.pause() / video.play()
```

配布ZIPの主な構成は次の通りです。

```text
YouTubeDictationPauseControl-<version>/
├── YouTubeDictationControl.exe   通知領域常駐アプリ
├── config/                       設定例
├── extension/                    Brave / Chromium拡張機能
├── server/                       127.0.0.1専用Node.js Bridge
├── docs/                         E2E確認資料
├── licenses/                     第三者ライセンス
└── third_party_sources/          組み込みAutoHotkeyの対応ソース
```

## 必要なもの

- Windows 10 / 11（x64）
- Brave BrowserまたはChromium系ブラウザ
- Node.js 22以上

**配布版の利用にAutoHotkeyのインストールは不要です。** ソースの`.ahk`を直接実行する開発者だけが、インストール済みAutoHotkey v2を使用します。

## セットアップ

### 1. 配布ZIPを用意して展開する

[Latest Release](https://github.com/misaka310/youtube-dictation-pause-control/releases/latest)から`YouTubeDictationPauseControl-<version>-windows-x64.zip`を取得し、書き込み可能な任意のフォルダへ展開します。各ReleaseにはZIPと、その検証用`SHA256SUMS.txt`が添付されます。AutoHotkeyの別インストールは不要です。

配布ZIPを自分で生成する場合は、リポジトリを取得して次を実行します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-release.ps1
```

ZIP内のファイル構成を崩さず、そのまま使用してください。

### 2. 拡張機能を読み込む

1. Braveで`brave://extensions`を開きます。
2. デベロッパーモードをオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」から、展開先の`extension`フォルダを選びます。

### 3. 常駐アプリを起動する

`YouTubeDictationControl.exe`をダブルクリックします。

Windows右下の通知領域にアイコンが表示されます。見えない場合は、タスクバー右端の上向き矢印から隠れているアイコンを表示してください。ターミナルウィンドウは開きません。

起動後、EXEは次を行います。

- Node.js 22以上の場所を検出
- `server/server.js`をウィンドウ非表示で直接起動
- `/health`で互換Bridgeを確認
- Bridge終了時に、連続失敗と再起動間隔を確認して自動復旧
- Typeless / Wispr Flowのホットキー監視

### 4. 動作確認

1. BraveでYouTube動画を再生します。
2. `Ctrl + ]`（Wispr Flow）または`右Ctrl + 右Shift`（Typeless）を押して音声入力を開始します。左側のCtrl／Shiftでは反応しません。
3. 動画が一時停止することを確認します。
4. 同じホットキーでもう一度終了し、動画が再開することを確認します。

詳細は[`docs/e2e-checklist.md`](docs/e2e-checklist.md)を参照してください。

## 通知領域メニュー

通知領域のアイコンを右クリックすると、次の操作ができます。

- `Status: ...`: Bridgeの現在状態
- `Restart local bridge`: このEXEが所有するBridgeを再起動
- `Reset dictation state`: 音声入力状態をinactiveへ戻す
- `Open log`: `logs/control.log`を開く
- `Start with Windows`: 現在のユーザーのスタートアップ登録を切り替える
- `Exit`: 常駐アプリと、このアプリが所有するNode.js Bridgeを終了

既に別の互換Bridgeが起動している場合、そのプロセスを勝手に停止しません。

## 状態が逆になったとき

Typeless / Wispr Flowを実際に停止してから`Ctrl + Alt + R`を押すか、通知領域の`Reset dictation state`を選びます。内部のTypeless・Wispr Flow・集約状態とdebounce時刻をinactiveへ戻し、HTTP Bridgeにもinactiveを送ります。

この操作は音声入力アプリ本体を停止しません。録音中のまま実行すると実状態と再びずれるため、入力終了後に使用してください。

## 自動起動と停止

配布版では、通知領域メニューの`Start with Windows`を選ぶのが通常の設定方法です。現在のユーザーのスタートアップフォルダにEXEへのショートカットを作成するため、管理者権限は不要です。

ソース作業用の補助スクリプトもあります。

```cmd
scripts\windows\setup-autostart.bat
scripts\windows\remove-autostart.bat
stop.bat
```

`stop.bat`はPID、実行ファイル名、コマンドライン、Bridgeの`/health`を照合し、このツールに該当するプロセスだけを停止します。

## 設定

設定を変更しない場合、`config/settings.json`は不要です。変更する場合だけ`config/settings.example.json`をコピーします。

```cmd
copy config\settings.example.json config\settings.json
```

```json
{
  "port": 17654,
  "pollingIntervalMs": 500,
  "typelessHotkey": "RightCtrl+RightShift",
  "wisprFlowHotkey": "Ctrl+]",
  "resetHotkey": "Ctrl+Alt+R",
  "autoStartServer": true,
  "debugMode": false
}
```

| Key | Meaning |
|---|---|
| `port` | ローカルHTTP Bridgeの待受ポート。標準は17654 |
| `pollingIntervalMs` | 互換用設定。現行Content Scriptの状態取得間隔は500ms固定 |
| `typelessHotkey` | Typeless用ホットキー |
| `wisprFlowHotkey` | Wispr Flow用ホットキー |
| `resetHotkey` | 内部状態とBridgeをinactiveへ同期する復旧用ホットキー |
| `autoStartServer` | 起動時にBridgeが未起動なら開始するか |
| `debugMode` | AHK側の状態ToolTipを表示するか |

ポートを変更する場合は、設定だけでなく拡張機能と検証・停止スクリプト側も同じ値に合わせる必要があります。

## 開発・テスト

Node.jsテストは次で実行します。

```cmd
npm test
```

テスト対象には、構文・JSON、HTTP API、Content Script、Background Worker、AHK常駐契約、プロセス所有権、リリース内容とライセンス契約が含まれます。

個別実行:

```cmd
npm run check
npm run test:api
npm run test:extension
npm run test:background
npm run test:runtime
npm run test:release
```

AutoHotkey未導入の環境でも、ビルドスクリプトが公式の固定バージョンをSHA-256検証付きで取得してEXEとZIPを作成します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-release.ps1 -KeepStaging
```

生成物の実機検証:

```powershell
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-release-runtime.ps1 `
  -PackageDirectory "dist\YouTubeDictationPauseControl-$version"
```

この検証は、EXE起動、ローカルBridgeの健康状態、親子プロセス所有権、Node強制終了後の別PID復旧、通常終了時のOwned Bridge停止を確認します。

通常のGitHub Actions CIは、ブランチへのpushとpull requestごとにWindows／Node.js 22で`npm test`と配布ZIPのビルド確認を実行します。実際のYouTube画面と音声入力アプリを使う確認は[`docs/e2e-checklist.md`](docs/e2e-checklist.md)で行います。

## GitHub Releaseの自動公開

`package.json`のバージョンと同じ`vX.Y.Z`タグをpushすると、専用のRelease workflowが次を自動実行します。

1. タグと`package.json`のバージョン一致を検証
2. 全テストを実行
3. 自己完結EXEを含むWindows x64 ZIPを生成
4. ZIPの`SHA256SUMS.txt`を生成
5. GitHub Releaseを作成し、ZIPとチェックサムを添付

同じタグのworkflowを再実行した場合は、既存Releaseの添付ファイルを`--clobber`で置き換えます。保守者向けの手順は[`docs/releasing.md`](docs/releasing.md)を参照してください。

## プライバシーとセキュリティ

- 外部サーバーへ音声や入力内容を送信しません。
- ローカルHTTP Bridgeは`127.0.0.1`のみにバインドします。
- APIキー、OAuthトークン、認証情報は使いません。
- 実行時ログは`logs/control.log`、PIDは`runtime/`に保存され、Git管理外です。
- ローカルポートを外部ネットワークへ公開しないでください。
- CORSは拡張機能Origin向けに制限しています。

詳しくは[`SECURITY.md`](SECURITY.md)を参照してください。

## 制限

- YouTube側のDOM変更やブラウザ仕様変更で動作しなくなる場合があります。
- 拡張機能が読み込まれていないタブは制御できません。
- このツールが一時停止していない動画は、終了時に再開しません。
- Pause Guardは再生復帰の抑制を試みますが、すべてのYouTube UI状態で完全な停止維持を保証するものではありません。
- Typeless / Wispr Flow本体の録音状態を直接取得せず、ホットキー押下を状態トグルとして扱います。
- Node.js 22以上は別途必要です。Node.js自体はEXEに同梱していません。

## 旧方式について

Native Messagingは、レジストリ・絶対パス・Service Worker寿命の扱いが複雑なため採用していません。検討記録は`docs/legacy-native-messaging.md`にあります。

## License

このリポジトリ独自のソースコードはMIT Licenseです。配布版EXEに組み込まれるAutoHotkey v2.0.26ランタイムはGPL-2.0です。配布ZIPにはGPL本文と対応するAutoHotkeyソースアーカイブを含めます。詳細は[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)を参照してください。
