# PageNest 1.8.0 Release Sign-off

## Release Candidate

- Validated source commit: `9b3d046a558a024718aa398e6b93218e0b80a740`
- Branch: `codex/site-capture-fidelity`
- Date: 2026-08-09
- Decision: **BLOCKED**

The Local HTML feature itself passed its automated and real Edge smoke tests. Public beta sign-off remains blocked because clean Windows images, a real 1.7.4 upgrade, actual Obsidian UI compatibility and the required live Xiaohongshu/Guyue regressions were not completed.

## Automated Tests

| Check | Result |
| --- | --- |
| Python | **PASS — 118 passed** |
| Python branch coverage | **PASS — 79%** (required minimum 70%) |
| Ruff | **PASS** |
| JavaScript syntax | **PASS — 32 files** |
| JavaScript tests | **PASS — all 13 `tests/test_*.js` scripts** |
| Repository/release boundary | **PASS — 148 tracked files validated** |

Pytest was run with an explicit unique temporary root because the current Administrator account cannot traverse test-output directories created by an earlier sandbox account. All 118 test assertions ran and passed.

## Local HTML Capture

| Scenario | Result | Evidence |
| --- | --- | --- |
| Basic HTML | PASS | Title and body captured as `standard`. |
| Body-only AI-generated HTML | PASS | Structured body fallback captured headings, list, quote, table and code. |
| Filename title fallback, spaces and Chinese | PASS | Synthetic tests and real Chinese filename smoke. |
| Data image | PASS | Remained embedded. |
| Relative local images | PASS | Two local images were inlined in the browser. |
| Remote HTTPS image | PASS | Inlined and saved in the real fixture. |
| Dynamic DOM | PASS | Content added after 300 ms appeared in the saved page. |
| Same-content duplicate | PASS | Second save returned duplicate and did not create `_2`. |
| Changed content, same filename | PASS | Version B created a second page. |
| File access denied | PASS | Real Edge displayed the four-step “允许访问文件网址” guidance. |
| Path privacy | PASS | Payload and both saved pages contained no absolute local path or residual `file://`. |
| Sanitizer | PASS | Source script/style did not survive; service-side `file://` remained blocked. |

The resulting `.pagenest` was rendered and visually inspected. Headings, body, table, code block, three images and dynamic content were readable with no blank screen, overlap or obvious clipping.

## Ordinary Web Smoke

Actual Edge + unpacked extension + newly frozen service + a static HTTP page: **PASS**.

- `page_variant=standard`
- title/body captured
- source script removed
- code, data image and HTTPS link preserved
- first save created one `.pagenest`
- second save returned duplicate and retained one file

The generated page was not opened inside the Obsidian application in this run.

## Compatibility Matrix

See `docs/COMPATIBILITY_MATRIX_1.8.0.md`.

Summary:

- Extension 1.8.0 + Service 1.8.0: **PASS**
- Full stack with Viewer 1.3.0 inside Obsidian: **PARTIAL**
- Extension 1.8.0 + Service 1.7.4 upgrade prompt contract: **PARTIAL**
- Extension 1.7.4 + Service 1.8.0: **NOT TESTED**
- Old Viewer + new page: **NOT TESTED**

## Windows Smoke

| Environment | Result |
| --- | --- |
| Current Windows 11 Pro host, fresh temporary install directory | PASS |
| Clean Windows 11 VM/image | NOT TESTED |
| Clean Windows 10 VM/image | NOT TESTED |

The current-host installer smoke verified the bundled runtime without Python on `PATH`, service health, token generation, Unicode Vault, Viewer files, extension preconfiguration, occupied-port fallback, pairing security, collection, reinstall and uninstall preservation.

## Upgrade

| Path | Result |
| --- | --- |
| v1.8.0 repair/reinstall | PASS — token and configuration preserved |
| v1.7.4 → v1.8.0 | NOT TESTED |

## Real Site Regression

| Site | Result | Reason |
| --- | --- | --- |
| Xiaohongshu | NOT TESTED | Required live logged-in/unlogged-in note variants were not exercised in this run. |
| Guyue | NOT TESTED | Required live article variants were not exercised in this run. |

Given the recent adapter regressions, these rows must not be inferred from unit tests and remain release blockers.

## Atomic Write and Concurrency

- existing-file protection: PASS
- temp write/fsync failure cleanup: PASS
- `os.replace` failure cleanup: PASS
- render failure leaves no page/temp: PASS
- same page ×2 produces one final page: PASS
- different pages overlap rather than using a global collector lock: PASS
- Local HTML ×2 produces one final page: PASS

## Security Smoke

Automated security coverage passed for sanitizer removal of script/style/iframe/object/embed/SVG hazards, `javascript:` and event handlers, meta refresh, bearer authentication, CORS/origin policy, path validation, SSRF/private-address rejection, redirect validation, request/download limits and server-side `file://` rejection.

Viewer automation confirms:

- sandbox is `allow-popups allow-scripts` with no `allow-same-origin`
- copy bridge uses a random 64-hex channel
- `postMessage` checks frame source and channel
- oversized copy messages are rejected

Actual copy interaction inside Obsidian was not exercised in this run.

## Artifacts

See `docs/RELEASE_ARTIFACTS_1.8.0.md`. Four ZIPs and the no-Python Windows installer were generated. Archive extraction, required-file checks, SHA-256 generation and sensitive/path scans passed.

## Known Limitations

- Website DOM changes can break site adapters.
- Xiaohongshu comments depend on what the page has loaded before capture.
- Protected or canvas-only images may be unavailable; the article is still saved with an explicit failure count.
- Complex local HTML CSS is not guaranteed to render exactly like the source page.
- Source JavaScript is deliberately not executed in the saved page.
- Local video/audio is not a core v1.8.0 support target.
- Local HTML requires the user to enable Chrome/Edge “允许访问文件网址”.
- DNS rebinding hardening is deferred.
- The installer is unsigned and may trigger SmartScreen.

## Final Decision

**BLOCKED**

To reconsider `READY FOR PUBLIC BETA`, complete and record at minimum:

1. clean Windows 11 installation smoke (and Windows 10 if available);
2. real 1.7.4 → 1.8.0 upgrade;
3. new and legacy page opening plus copy inside Obsidian;
4. live Xiaohongshu and Guyue regression matrices.
