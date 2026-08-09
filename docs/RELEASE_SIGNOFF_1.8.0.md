# PageNest 1.8.0 Release Sign-off

## Release Candidate

- Validated source commit: `492805b07ad23feb6b9eb817905754863a759018`
- Branch: `codex/rc-ux-fixes`
- Date: 2026-08-10
- Decision: **BLOCKED**

The real Edge-to-Service-to-Vault path and the isolated real v1.7.4-to-v1.8.0 overwrite upgrade passed. Public beta sign-off remains blocked because a clean Windows 11 installation has not been tested. Windows 10 also remains untested.

## Automated tests

| Check | Result |
| --- | --- |
| Python | **PASS — 122 passed** |
| Python branch coverage | **PASS — 79%** (required minimum 70%) |
| Ruff | **PASS** |
| JavaScript syntax | **PASS — 33 files** |
| JavaScript tests | **PASS — all 14 `tests/test_*.js` scripts** |
| PowerShell syntax | **PASS** |
| Repository, version and release boundary | **PASS — 153 tracked files validated** |

Pytest used the tracked `tests/` directory, a unique ignored temporary root and a process-local Git safe-directory setting. The setting was not written to global or repository configuration.

## Real user chain

| Checkpoint | Result | Evidence |
| --- | --- | --- |
| Service connection | PASS | The installed 1.8.0 service responded on its actual port, and the real Edge popup showed `PageNest 后台服务已连接` and `Service 1.8.0`. |
| Vault connection | PASS | The configured real user Vault existed, had an Obsidian configuration and passed a temporary create/read/delete permission check. The absolute local path is deliberately omitted. |
| Real save | PASS | A normal page was saved through the actual extension and service, appeared in the configured Vault and opened in actual Obsidian. |

The original connection failure was caused by a stale saved endpoint: the service was healthy on a known fallback port, while the extension kept retrying another known port with an otherwise valid token. The bounded connection logic now probes the existing token across the known local ports before pairing. Authentication remains enabled, and no manual port or token entry is required for this recovery path.

## Actual Obsidian Viewer

Actual Obsidian 1.13.4 and PageNest Viewer 1.3.0 were used.

| File | Result | Evidence |
| --- | --- | --- |
| New v1.8.0 `.pagenest` | PASS | Open, title, body, images, code, scrolling, external link, ordinary copy and code copy passed. |
| Real v1.7.4 `.pagenest` | PASS | Open, body, scrolling, external link and both copy paths passed. The historical capture contained no embedded image because its original remote-image download had failed. |
| Legacy `.hermes` | PASS | The old extension was recognized and open, scroll, link and both copy paths passed. |

The iframe sandbox remained exactly `allow-popups allow-scripts`; `allow-same-origin` was not added. Random 64-hex channels and the source-checked `postMessage` copy bridge remained functional. No blank page or severe Viewer console error was observed.

## Real site regression

### Xiaohongshu: PASS

Four logged-out real image-note cases were exercised: ordinary image note, two-image carousel, asynchronous note and notes with visible comments. Core title, author, body and main media were captured; the carousel advanced in the saved page; loaded comments were structured; navigation, recommendations and footer were excluded. Re-saving returned `duplicate=true` without `_2.pagenest`. Logged-in behavior remains **NOT TESTED**. Comments remain best-effort and include only content already loaded by the site.

### Guyue: PASS

Three real articles were exercised: modern text, modern image-rich and legacy DOM. Titles, paragraphs and expected image order were intact, without page shell, navigation, recommendations or footer pollution. Re-saving returned `duplicate=true` without `_2.pagenest`.

## HTTP and local HTML

Actual Edge captured an ordinary HTTP page and a `file://` HTML page through the installed 1.8.0 service. Both produced readable `.pagenest` files. A second capture of each returned the existing page and did not create `_2.pagenest`. Local absolute paths were not retained in payloads or output, and the server-side downloader still rejects `file://`.

## Installed upgrade

| Item | Result |
| --- | --- |
| Historical source | Real `PageNest-Setup-1.7.4.exe`, SHA-256 `9bcc3b099d389f33812a0fb08bdb4188664505b7a7e02bb04619f6db96d8813c`, source commit `864f2291acc6a171f8a09e75e6a35bf57b5df56b` |
| Upgrade method | Normal v1.8.0 installer overwrite while the isolated v1.7.4 service was running |
| Vault | PASS — preserved |
| Historical files | PASS — exact SHA-256 values preserved |
| Token and port | PASS — preserved |
| Startup | PASS — one entry targeting the upgraded installation |
| Service processes | PASS — the historical process was stopped and only one isolated instance was started afterward |
| Old `.pagenest` and `.hermes` | PASS in actual Obsidian |
| Post-upgrade HTTP save and duplicate | PASS |
| Post-upgrade local HTML save and duplicate | PASS |

The first overwrite attempt exposed an installer defect: Windows Restart Manager could not stop the headless service, so setup aborted. The installer now stops only a `PageNestService.exe` whose resolved executable path exactly matches the target installation. Failure is explicit; unrelated processes with the same name are not terminated. The complete upgrade was then repeated from the real v1.7.4 installer and passed.

## Mixed versions

| Combination | Result |
| --- | --- |
| Extension 1.8.0 + Service 1.7.4 | PASS — the popup explicitly says the local service is too old; no collect call or 422 downgrade retry occurs |
| Extension 1.7.4 + Service 1.8.0 | PASS — an ordinary page reached the new service and duplicate detection returned the historical page |

The old service has no `/api/meta`. A successful authenticated `/api/health` response after metadata returns 404 is treated as an incompatible legacy service, not as an unauthenticated or disconnected service.

## Installer and security boundaries

- The no-Python installer starts the service and registers one per-user Startup shortcut.
- A named mutex prevents duplicate service instances.
- Bearer authentication remains required.
- CORS/origin, path validation, SSRF/private-address rejection, redirect validation, request and download limits, sanitizer boundaries and server-side `file://` rejection passed automated tests.
- Viewer copy messages remain source/channel checked and size limited.

## Windows coverage

| Environment | Result |
| --- | --- |
| Current Windows 11 Pro host | PASS — real chain and isolated upgrade |
| Clean Windows 11 VM/image | NOT TESTED |
| Clean Windows 10 VM/image | NOT TESTED |

Login Startup registration was inspected, but a full Windows sign-out/sign-in cycle was not performed in this round.

## RC bug classification

- **P0, fixed:** a valid saved token did not discover the running service after its known local port changed.
- **P0, fixed:** overwrite setup aborted when the installed headless service was still running.
- **P0, fixed:** Extension 1.8.0 displayed a generic disconnection against a healthy Service 1.7.4 instead of an explicit upgrade requirement.
- **P0, fixed:** Xiaohongshu readiness could complete on an incomplete shell and duplicated carousel clones could be saved.
- **P0, fixed:** Guyue legacy `.detail-fuwenben .html` articles were not recognized.
- **P1, fixed:** Xiaohongshu loaded comments lost their field and reply hierarchy.
- **P2, known limitation:** Xiaohongshu comments include only content already loaded by the site; logged-in behavior was not tested.

## Known limitations

- Website DOM changes can break site adapters.
- Protected or canvas-only images may be unavailable; the article still saves with a failure count.
- Complex local HTML CSS is not guaranteed to reproduce the source exactly, and source JavaScript is deliberately not executed.
- Local video/audio is not a core v1.8.0 target.
- Browser file access must be enabled for local HTML capture.
- DNS rebinding hardening is deferred.
- The installer is unsigned and may trigger SmartScreen.

## Final decision

**BLOCKED**

To reconsider `READY FOR PUBLIC BETA`, complete and record a clean Windows 11 installation smoke. Windows 10 remains `NOT TESTED` and must not be represented as passed.
