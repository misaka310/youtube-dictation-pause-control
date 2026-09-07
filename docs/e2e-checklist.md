# 実ブラウザE2Eチェックリスト

この文書は、実際のWindows、配布版`YouTubeDictationControl.exe`、Typeless / Wispr Flow、Chromium系ブラウザ、YouTube画面で行う手動確認用です。別プロジェクトや個人ワークスペースを前提にしません。

## 共通準備

- Chromium系ブラウザと、使用するTypeless / Wispr Flowを用意する。
- `extension`をパッケージ化されていない拡張機能として読み込む。
- 配布フォルダの`YouTubeDictationControl.exe`を起動する。
- ターミナルが開いたままにならず、Windows右下の通知領域にアイコンが表示されることを確認する。
- 通知領域メニューの`Status: ...`が`running`になり、`http://127.0.0.1:17654/health`が`ok: true`を返すことを確認する。
- `logs/control.log`とYouTubeタブのDevToolsコンソールを開く。
- 各ケース開始前にTypeless / Wispr Flowを停止する。内部状態が不明なら`Ctrl + Alt + R`または通知領域の`Reset dictation state`を実行する。

## 常駐アプリの事前確認

1. `Open recent activity`と`Open full log`で現在の配布フォルダのログが開く。
2. `Restart local bridge`後にBridgeが再び`running`になる。
3. `Start with Windows`で現在ユーザーのスタートアップ登録を切り替えられる。
4. `Exit`で通知領域アイコンと、このEXEが所有するNode.jsだけが終了する。

## 1. Wispr Flow開始・終了

1. YouTube動画を再生する。
2. `Ctrl + ]`でWispr Flowを開始する。
3. 動画が停止することを確認する。
4. 400ms以上待って`Ctrl + ]`で終了する。

期待結果:
- 開始時に動画が停止する。
- 終了時に、このツールが同一sessionで停止した動画だけが再開する。

## 2. Typeless開始・終了

1. YouTube動画を再生する。
2. `Ctrl + [`でTypelessを開始する。
3. 動画が停止することを確認する。
4. 400ms以上待って`Ctrl + [`で終了する。

期待結果はWispr Flowと同じです。

## 3. 最初から停止中の動画

1. 動画をユーザー操作で停止しておく。
2. いずれかの音声入力を開始して終了する。

期待結果:
- このツールは停止所有権を取得しない。
- 終了時に動画を勝手に再生しない。

## 4. Pause Guard

1. 音声入力開始で動画を停止させる。
2. 入力中にYouTubeの再生ボタンまたはスペースキーで再生を試みる。
3. 入力を終了する。

期待結果:
- 入力中は再停止する。
- 入力終了後は所有権条件を満たす場合だけ再開する。

## 5. SPA動画切替

1. 入力中のままYouTube内リンクで別動画へ移動する。
2. 新しい動画が再生を開始した場合の挙動を確認する。
3. 入力を終了する。

期待結果:
- 新しいvideo要素へlistenerを付け直す。
- active中なら再生中の新しいvideoも停止する。

## 6. TypelessとWispr Flowの重複

1. Typelessを開始する。
2. 400ms以上待ってWispr Flowも開始する。
3. 片方だけ終了する。
4. 最後にもう片方も終了する。

期待結果:
- 最初の開始で集約状態がactiveになる。
- 片方だけ終了しても停止を維持する。
- 両方終了した時点で条件付き再開する。

## 7. 400ms以内の二重押下

同じホットキーを400ms以内に2回押します。

期待結果:
- 2回目はdebounceで無視される。
- Bridge状態は1回目だけを反映する。

## 8. Node.js Bridge停止と復旧

1. 常駐EXEが起動したNode.js Bridgeだけを停止する。
2. 最大25秒程度待つ。
3. `/health`が再び`ok: true`になることを確認する。

期待結果:
- 通信失敗だけで動画を勝手に再生しない。
- 常駐EXEが所有Bridgeを新しいPIDで復旧する。

## 9. Background Worker通信失敗

拡張機能のService Worker停止または再読み込みで一時的に通信を切ります。

期待結果:
- 前回状態や停止所有権を通信失敗だけで破壊しない。
- 通信復旧後に次回取得を継続できる。

## 10. 拡張機能無効化・再有効化

期待結果:
- 無効化後は新しい制御を行わない。
- 無効化前の停止所有権を復元して勝手に再生しない。
- 再有効化後、タブ再読み込みで通常動作へ戻る。

## 11. AHK停止

入力中にAHK側を終了します。

期待結果:
- Bridgeは最後の状態を保持する。
- AHK停止だけを理由に勝手にinactiveへ変えない。

復旧は入力アプリを停止し、AHKを再起動して`Reset dictation state`を使用します。

## 12. `/reset`

```cmd
curl.exe -X POST http://127.0.0.1:17654/reset
```

期待結果:
- Bridgeは`active=false, sessionId=0`になる。
- Content Scriptは古いsessionの所有権を破棄し、勝手に再生しない。

## 13. ブラウザ終了・再起動

inactive / activeの両状態でブラウザを完全終了し、再起動後にYouTubeを開きます。

期待結果:
- Content Scriptの停止所有権はブラウザ再起動をまたいで引き継がない。
- Bridgeがinactiveなら動画を操作しない。
- Bridgeがactiveなら新しいタブ上でactive状態として扱う。

## 14. 常駐アプリ二重起動

`YouTubeDictationControl.exe`を2回起動します。

期待結果:
- 通知領域常駐は1インスタンスだけになる。
- 既存Bridgeを別プロセスとして誤停止しない。

## 15. Windows再ログイン後の自動起動

`Start with Windows`を有効にしてWindowsへ再ログインします。

期待結果:
- 常駐アプリが1回だけ起動する。
- Bridgeが`127.0.0.1:17654`で利用可能になる。
- ブラウザを開くまで外部サイトへ通信しない。

## 記録

各ケースは、実際に操作した場合だけ日時、OS、ブラウザ、結果、必要なログを記録してください。自動テスト結果を実ブラウザE2Eの実施結果として扱わないでください。
