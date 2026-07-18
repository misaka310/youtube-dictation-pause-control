# Third-party notices

This repository's original source code is licensed under the MIT License in `LICENSE`.

## AutoHotkey runtime

Release packages include the AutoHotkey v2.0.26 self-contained runtime inside `YouTubeDictationControl.exe`.

- Project: AutoHotkey
- Version: 2.0.26
- License: GNU General Public License version 2 (GPL-2.0)
- License text: `licenses/AutoHotkey-GPL-2.0.txt`
- Corresponding source: `third_party_sources/AutoHotkey-v2.0.26-source.zip` in the release package
- Upstream source tag: `https://github.com/AutoHotkey/AutoHotkey/tree/v2.0.26`

The MIT license for this project's own files does not replace or alter the GPL-2.0 terms that apply to the included AutoHotkey runtime.

## Node.js runtime

Release packages include the official Node.js v24.18.0 Windows x64 distribution under `vendor/node` so end users do not need a separate Node.js installation.

- Project: Node.js
- Version: 24.18.0
- License and bundled third-party notices: `vendor/node/LICENSE`
- Upstream release: `https://nodejs.org/download/release/v24.18.0/`

The Node.js distribution is copied without removing its upstream license and notice files.

## Ahk2Exe build tool

The release executable is produced with Ahk2Exe 1.1.37.02a2. Ahk2Exe is a build-time tool and is not included in the release package.

- Project: Ahk2Exe
- Version: 1.1.37.02a2
- License: WTFPL
- Upstream release: `https://github.com/AutoHotkey/Ahk2Exe/releases/tag/Ahk2Exe1.1.37.02a2`
