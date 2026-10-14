# 設定リファレンス

通常利用では`config/settings.json`は不要です。既定値を変更する場合だけ、配布ZIPまたはリポジトリ内の`config/settings.example.json`を`config/settings.json`へコピーします。

```cmd
copy config\settings.example.json config\settings.json
```

## 設定例

```json
{
  "port": 17654,
  "pollingIntervalMs": 500,
  "typelessHotkey": "Ctrl+[",
  "wisprFlowHotkey": "Ctrl+]",
  "resetHotkey": "Ctrl+Alt+R",
  "autoStartServer": true,
  "debugMode": false
}
```

| Key | Meaning |
|---|---|
| `port` | ローカルHTTP Bridgeの待受ポート。既定値は17654 |
| `pollingIntervalMs` | 互換用設定。現行Content Scriptの状態取得間隔は500ms固定 |
| `typelessHotkey` | Typeless用ホットキー |
| `wisprFlowHotkey` | Wispr Flow用ホットキー |
| `resetHotkey` | 内部状態とBridgeをinactiveへ同期する復旧用ホットキー |
| `autoStartServer` | 起動時にBridgeが未起動なら開始するか |
| `debugMode` | AutoHotkey側の状態ToolTipを表示するか |

## ホットキーの制約

Typeless / Wispr Flowのホットキーには、`Ctrl + [`や`Ctrl + ]`のように通常キーを1つ含めてください。`Ctrl + Shift`や`RightCtrl + RightShift`のような修飾キーだけの組み合わせは、押下順序やキーリピートで複数回発火して状態がずれるため使用できません。旧設定値は起動時に`Ctrl + [`へ移行されます。

## ポートを変更する場合

設定だけでなく、拡張機能、検証スクリプト、停止スクリプトも同じ値へ合わせる必要があります。BridgeはloopbackのHTTPだけを使用し、外部ネットワークへ公開しないでください。

## 使用ポート

| ポート | 用途 |
|---|---|
| 17654 | ローカルHTTP Bridgeの既定待受ポート（`port`設定で変更可） |

## 自動起動と停止

配布版では通知領域メニューの`Start with Windows`を使います。現在のユーザーのスタートアップフォルダへショートカットを作成するため、管理者権限は不要です。

ソース作業用の補助スクリプト:

```cmd
scripts\windows\setup-autostart.bat
scripts\windows\remove-autostart.bat
stop.bat
```

`stop.bat`はPID、実行ファイル名、コマンドライン、Bridgeの`/health`を照合し、このツールに該当するプロセスだけを停止します。
