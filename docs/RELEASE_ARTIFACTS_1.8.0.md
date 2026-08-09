# PageNest 1.8.0 Release Artifacts

Generated from validated source commit `9b3d046a558a024718aa398e6b93218e0b80a740` on 2026-08-09.

## User and submission artifacts

| Artifact | Bytes | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `PageNest-Setup-1.8.0.exe` | 49,840,917 | `8e2468728f51312ccdc44252c81df7320682ee8c8c96e94f2debd6e4ee104da7` | Recommended Windows installer; includes the Python runtime, service, extension files and Viewer. |
| `pagenest-browser-extension-v1.8.0.zip` | 52,356 | `22bf371efe398dc1619d9d6debbb04c4ac89a3dc7a4517b4b29baf9128c0c290` | Unpacked/manual Edge or Chrome extension package. |
| `pagenest-web-store-v1.8.0.zip` | 52,356 | `22bf371efe398dc1619d9d6debbb04c4ac89a3dc7a4517b4b29baf9128c0c290` | Edge Add-ons upload package. |
| `pagenest-obsidian-viewer-v1.3.0.zip` | 2,826 | `3cdfb82f02270ef44fbdcddc377f1f2296dca47566161d5241edee67aa063c59` | Manual Obsidian Viewer installation. |
| `pagenest-local-server-windows-v1.8.0.zip` | 49,093 | `599df8b3c3b34f820fa5eedce7d864017e1846cc981e986097492454f8413816` | Source/portable service files. This ZIP requires Python; end users should use the installer. |

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
- Uninstall removed connection secrets and preserved the user-created page: **PASS**.

The installer is not Authenticode-signed. Windows SmartScreen warnings therefore remain possible.
