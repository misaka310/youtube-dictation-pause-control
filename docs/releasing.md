# GitHub Release手順

このリポジトリでは、`package.json`のバージョンと同じ`vX.Y.Z`タグをpushすると、GitHub ActionsがWindows向けReleaseを自動公開します。

## 自動公開されるもの

Release workflowはWindows／Node.js 22環境で次を実行します。

1. タグ名と`package.json`の`version`が完全一致することを検証
2. `npm test`を実行
3. `scripts/windows/build-release.ps1`で自己完結EXE、固定版Node.jsランタイム、Windows x64 ZIPを生成
4. ZIPのSHA-256を`SHA256SUMS.txt`へ出力
5. GitHub Releaseを作成し、ZIPと`SHA256SUMS.txt`を添付

同じタグのworkflowを再実行した場合、既存Releaseの添付ファイルは上書きされます。タグと`package.json`が一致しない場合や、テスト・ビルドが失敗した場合はReleaseを公開しません。

## 新しいバージョンを公開する

### 1. バージョンを更新する

`package.json`の`version`を次のバージョンへ変更します。例:

```json
{
  "version": "1.3.0"
}
```

READMEや設定例など、変更内容に関係するドキュメントも同じPRで更新します。

### 2. PRをマージする

PRのCIが成功したことを確認して`main`へマージします。タグはPRブランチではなく、マージ後の`main`コミットへ付けます。

### 3. `main`へタグを付けてpushする

```powershell
git switch main
git pull --ff-only origin main
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
git tag -a "v$version" -m "YouTube Dictation Pause Control v$version"
git push origin "v$version"
```

`vX.Y.Z`の`X.Y.Z`は、`package.json`の`version`と完全に同じでなければなりません。

### 4. 自動公開結果を確認する

GitHub Actionsの`Release` workflowが成功し、GitHub Releaseに次の2ファイルが添付されていることを確認します。

- `YouTubeDictationPauseControl-X.Y.Z-windows-x64.zip`（`vendor/node/node.exe`と`vendor/node/LICENSE`を含む）
- `SHA256SUMS.txt`

Release本文はGitHubの自動生成ノートを使用します。

## ローカルで事前確認する

```powershell
npm test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\validate-release-tag.ps1 -Tag vX.Y.Z
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-release.ps1 -KeepStaging
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-release-runtime.ps1 `
  -PackageDirectory dist\YouTubeDictationPauseControl-X.Y.Z
```

`validate-release-tag.ps1`には、実際に`package.json`へ設定したバージョンと同じタグを渡してください。`verify-release-runtime.ps1`では、`bundledNodeVersion`が`v24.18.0`で、Bridgeの実行ファイルが配布フォルダ内の`vendor/node/node.exe`であることも確認します。

## 同梱Node.jsを更新する

Node.jsランタイムを更新する場合は、`scripts/windows/build-release.ps1`の`NodeVersion`、公式Windows x64 ZIPのURL、`SHASUMS256.txt`に掲載されたSHA-256を同じPRで更新します。`latest-v24.x`のような可変URLは使用せず、完全なバージョンを固定します。

同時に`THIRD_PARTY_NOTICES.md`、README、E2E・公開チェックリスト、Node.jsバージョンを検証する契約テストを更新し、配布ZIPの`vendor/node/node.exe --version`と`vendor/node/LICENSE`を確認します。

## 失敗時

- タグと`package.json`が不一致: 誤ったタグを削除し、正しいタグを同じ`main`コミットへ付け直します。
- テストまたはビルド失敗: タグを使い回さず、修正をPRでマージしてバージョンを上げ、新しいタグを作成します。
- Release作成後の一時的な添付失敗: 同じworkflow runを再実行できます。既存ReleaseのZIPと`SHA256SUMS.txt`が上書きされます。

公開済みタグの内容を別コミットへ移動する運用は行いません。
