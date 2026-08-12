# PageNest 1.8.0 Release Artifacts

Generated from validated source commit `06fb684d9c858c48badf7064502c03e22fa9e456` on 2026-08-12.

## User and submission artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `PageNest-Setup-1.8.0.exe` | 49,860,255 | `c22d9868bdf3ae8f55f7d83d4769c92fe61e7dbe8b2076a5a22e41e69a213865` | Recommended Windows installer; includes the Python runtime, service, extension files and Viewer. |
| `pagenest-browser-extension-v1.8.0.zip` | 59,746 | `a37a0293b909f5dcba4e5e6ca3268baccc16fb7cec2b50ebf602321a12a43952` | Unpacked/manual Edge or Chrome extension package. |
| `pagenest-web-store-v1.8.0.zip` | 59,746 | `a37a0293b909f5dcba4e5e6ca3268baccc16fb7cec2b50ebf602321a12a43952` | Edge Add-ons upload package. |
| `pagenest-obsidian-viewer-v1.3.0.zip` | 2,826 | `3cdfb82f02270ef44fbdcddc377f1f2296dca47566161d5241edee67aa063c59` | Manual Obsidian Viewer installation. |
| `pagenest-local-server-windows-v1.8.0.zip` | 53,616 | `609d0937360bace4fbcf29263776cb165e471499d0ec1444288272411a498011` | Source/portable service files. This ZIP requires Python; end users should use the installer. |

Local outputs:

- `release/v1.8.0/`
- `release/store-v1.8.0/`

## Inspection results

All four ZIP files were actually extracted and inspected:

| Package | File count | Required root check |
| --- | ---: | --- |
| Browser extension | 25 | `manifest.json`, source modules and 16/32/48/128 icons present |
| Browser store | 25 | Same upload-ready extension boundary |
| Obsidian Viewer | 4 | `main.js`, `manifest.json`, `styles.css`, `versions.json` present |
| Local service source ZIP | 26 | Service source, requirements and launch scripts present |

Archive entry names and contents were scanned for `.env`, credentials used by smoke tests, databases, Vault data, collected `.pagenest`/`.hermes` files, `audit-info`, caches, Crashpad/browser profiles, local test HTML and the following machine-path patterns:

```text
D:\
C:\Users\
file:///C:/
file:///D:/
```

Result: **PASS**. `.env.example` is included intentionally and contains placeholders only; no real `.env` is included. The installer binary was also scanned for the listed development/test path markers with no matches.

## Runtime verification

- Frozen `PageNestService.exe` started with Python removed from `PATH` and created a `.pagenest`: **PASS**.
- v1.8.0 silent install into a fresh temporary directory: **PASS**.
- Unicode Vault selection and Viewer installation: **PASS**.
- Occupied 8765 fallback to 18765: **PASS**.
- Edge store ID pairing and untrusted-origin rejection: **PASS**.
- Same-version reinstall preserved the token: **PASS**.
- Installed service opened a visible native Vault picker; cancelling kept the existing Vault and configuration: **PASS**.
- Same-version reinstall preserved the configured AI URL, model name and API key: **PASS**.
- Uninstall removed connection secrets and preserved the user-created page: **PASS**.

The installer is not Authenticode-signed. Windows SmartScreen warnings therefore remain possible.
