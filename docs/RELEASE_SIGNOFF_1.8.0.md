# PageNest 1.8.0 Release Sign-off

## Release Candidate

- Validated source commit: `8cb275a72924f3c150788f9a3662a24a56a932d4`
- Branch: `codex/site-capture-fidelity`
- Date: 2026-08-09
- Decision: **BLOCKED**

The Local HTML feature, actual Obsidian Viewer interaction, and live Xiaohongshu/Guyue regressions passed. Public beta sign-off remains blocked because a clean Windows 11 installation and a real 1.7.4 to 1.8.0 upgrade have not been tested.

## Automated Tests

| Check | Result |
| --- | --- |
| Python | **PASS — 118 passed** |
| Python branch coverage | **PASS — 79%** (required minimum 70%) |
| Ruff | **PASS** |
| JavaScript syntax | **PASS — 32 files** |
| JavaScript tests | **PASS — all 13 `tests/test_*.js` scripts** |
| Repository/release boundary | **PASS — 151 tracked files validated** |

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
- Full stack with Viewer 1.3.0 inside Obsidian 1.12.7: **PASS**
- Extension 1.8.0 + Service 1.7.4 upgrade prompt contract: **PARTIAL**
- Extension 1.7.4 + Service 1.8.0: **NOT TESTED**
- Viewer 1.3.0 + new page: **PASS**

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

## Actual Obsidian Viewer

Actual Obsidian 1.12.7 with PageNest Viewer 1.3.0 was used, not a browser-only or unit-test substitute.

| File | Result | Evidence |
| --- | --- | --- |
| New v1.8.0 `.pagenest` | PASS | Open, title, body, three images, code block, scrolling, external link, ordinary copy and code copy passed. |
| Legacy v1.7.4 `.pagenest` | PASS | Open, body, images, scrolling, link and both copy paths passed. |
| Legacy `.hermes` | PASS | The old extension was recognized and both ordinary/code copy paths passed. |

All three cases rendered without a blank page, serious console exception or obvious layout corruption. The live Xiaohongshu and legacy-DOM Guyue captures were also opened in Obsidian and visually checked. The iframe sandbox remained exactly `allow-popups allow-scripts`; `allow-same-origin` was not added. Each view used a distinct random 64-hex channel, and the `postMessage` copy bridge remained functional.

## Real Site Regression

All captures used a real Edge session and the current unpacked v1.8.0 extension under normal manual browsing conditions. No login, CAPTCHA, anti-bot or account control was bypassed. Reports retain canonical URLs only and no Cookie or page token.

### Xiaohongshu: PASS

Four distinct valid image notes were exercised in a fresh logged-out Edge profile: an ordinary image note, a two-image carousel, a noticeably asynchronous note, and notes with visible comment sections. Titles, authors and core bodies were present; main image counts were 1, 2, 1 and 1. Loaded comment counts were 18, 12, 20 and 20. The two-image gallery advanced to the second image in the final saved page. Main images decoded successfully, image order was preserved, exact duplicate carousel nodes were removed, and avatars/navigation/recommendations/footer were not substituted for article media. Re-saving each canonical note returned `duplicate=true` without creating `_2.pagenest`.

The slow case did not complete readiness on `og:title`, an arbitrary image or the page shell. Readiness required a stable title/body/main-media signature on consecutive polls; the saved body and media were already present when `preparePage` completed. Logged-in behavior remains **NOT TESTED**. Comments remain best-effort and do not block saving the note body.

### Guyue: PASS

Three real articles were exercised: one modern text article, one modern image-rich article and one legacy-DOM article. The adapters were respectively `guyue:.detail-content .markdown-body`, `guyue:.detail-content .markdown-body` and `guyue:.detail-fuwenben .html`. Body lengths were approximately 4,105, 15,700 and 2,893 characters; image counts were 0, 2 and 10. Every expected image in the two image-bearing pages decoded after scrolling. Titles, paragraphs and image order were intact, with no page-shell, navigation, recommendation or footer pollution. Re-saving all three returned `duplicate=true` without creating `_2.pagenest`.

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

Actual ordinary-text and code-block copy interaction passed inside Obsidian for the new and legacy fixtures, including the `.hermes` compatibility case.

## Artifacts

See `docs/RELEASE_ARTIFACTS_1.8.0.md`. Four ZIPs and the no-Python Windows installer were generated. Archive extraction, required-file checks, SHA-256 generation and sensitive/path scans passed.

## RC Bug Classification

- **P0, fixed:** Xiaohongshu readiness could complete on an incomplete shell and duplicated carousel DOM clones could be saved as repeated main images. The adapter now waits for a stable core-content/media signature and deduplicates resolved main-media URLs. Regression coverage was added.
- **P0, fixed:** Guyue legacy articles using `.detail-fuwenben .html` were not recognized even though their body was visible. The existing selector boundary now recognizes that legacy root. Regression coverage was added.
- **P1, fixed:** Xiaohongshu comments rendered inside the active note container were missed by the older selector set. The active container is now covered without making comments a save prerequisite.
- **P2, known limitation:** Xiaohongshu comments are best-effort and include only comments already loaded by the site. Logged-in behavior was not tested in this round.

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
