# Security Policy

This project is a local Windows utility. It does not use accounts, API keys, OAuth tokens, or external services.

## Local-only design

- The Node.js HTTP bridge binds to `127.0.0.1` only.
- The supported default port is `17654`. Changing it requires updating the local settings plus every hard-coded extension, startup, health-check, and shutdown reference to `17654`; changing only `config/settings.json` is not sufficient.
- Do not expose this port through firewall rules, reverse proxies, tunnels, or public network bindings.
- Release packages use the pinned Node.js runtime under `vendor/node`. Install a newer application Release to receive runtime updates instead of replacing individual files inside `vendor/node`.
- Runtime logs are written under `logs/` and `*.log` files are ignored by Git.
- Runtime PID files are written under `runtime/` and ignored by Git.
- User-specific `config/settings.json` is ignored by Git; publish `config/settings.example.json` only.

## Browser permissions

The extension requests access only to:

- `http://127.0.0.1:17654/*` — the local HTTP bridge described above.
- YouTube pages under `youtube.com`.

It does not request access to arbitrary websites or developer-only loopback services.

## CORS behavior

The local server accepts browser CORS requests only from extension origins such as `chrome-extension://...` and `moz-extension://...`. Requests without an `Origin` header are allowed for local tools such as AutoHotkey and curl.

## Reporting issues

If you find a security issue, open a private report or contact the maintainer before publishing exploit details. Include:

- OS and browser version
- reproduction steps
- expected impact
- whether the local port was exposed outside the machine

<!-- managed-by: repo-launch-doctor-security-baseline-v1 -->

## Reporting a vulnerability

Please do **not** publish suspected vulnerabilities in a public issue. Report them privately through GitHub's security-advisory flow for this repository:

https://github.com/misaka310/youtube-dictation-pause-control/security/advisories/new

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation. Reports that include a minimal proof of concept are especially useful.

## Response timeline

- Initial acknowledgement target: within 7 days.
- Triage and severity assessment target: within 14 days.
- Fix timing depends on impact and complexity; critical issues are prioritized before routine feature work.
- Coordinated public disclosure should wait until a fix or mitigation is available whenever practical.

## Supported versions

The current default branch and the latest published release, when releases exist, receive security fixes. Older snapshots may not receive backports.
