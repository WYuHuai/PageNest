# PageNest first hardening report

Date: 2026-08-08<br>
Branch: `codex/site-capture-fidelity`<br>
Repository: `D:\CODEX\LiulanqiChajian\Hermes-Obsidian-Web-Collector`

This report records the first technical-debt and root-cause pass. It is intentionally narrow: the work fixes confirmed regressions, adds regression protection, and does not attempt a broad refactor.

## Result at a glance

The implementation is suitable for another review round, but it is **not yet a final public-release sign-off**. Automated checks and package boundary checks pass. A clean Windows 10/11 installation test and live regression runs against representative Xiaohongshu and Guyue pages are still required before calling a release candidate ready.

## Changes by phase

| Phase | Root cause or risk | Change | Regression protection |
| --- | --- | --- | --- |
| 1 | Xiaohongshu pages were rendered without the capture metadata used for duplicate detection. | Centralized renderer system metadata and preserved `hermes-capture-version`, source, hash, and completion metadata for every page variant. | `test_xiaohongshu_page_preserves_metadata_and_duplicate_detection` |
| 2 | The popup retried `/api/collect` after a 422 by deleting `page_variant`, which hid capability mismatches and could change the requested capture. | Added authenticated `/api/meta` capability negotiation and explicit errors for old services, unsupported variants, network failures, 401, and real 422 responses. | `tests/test_service_capabilities.js`, `test_meta_reports_explicit_service_capabilities` |
| 3 | Software, API, capture, and file-format versions were coupled or described inconsistently. | Declared release/component versions separately from API protocol, `.pagenest` format, and capture version; updated validation and compatibility documentation. | Release metadata tests and repository validation |
| 4 | Xiaohongshu and Guyue extraction could run while the page shell existed but meaningful content had not arrived. | Added adapter-owned readiness predicates and shared selectors; extraction now waits for meaningful article/note content. | `tests/test_adapter_readiness.js` |
| 5 | A failed write could leave a partial `.pagenest` file or overwrite an existing capture. | Writes now use a same-directory temporary file, flush/fsync, and `os.replace`; temporary files are cleaned on failure and existing files are never overwritten. | Atomic-write, no-overwrite, fsync-failure, and cleanup tests |
| 6 | Two simultaneous requests for the same logical page could both write before duplicate detection completed. | Added a per-resource in-process lock with reference-counted cleanup around the collection transaction. | `test_concurrent_duplicate_collects_write_one_page` |
| 7 | Embedded `<style>` elements remained an active-content escape hatch in sanitized pages. | Sanitizer now blocks `style` in addition to script, iframe, object/embed, SVG, event handlers, and refresh metadata. | `test_sanitizer_blocks_embedded_style_and_active_markup` |
| 8 | Renderer output had no executable contract for all supported page variants. | Added a parameterized contract test and a declared `.pagenest` format meta tag. | `tests/test_renderer_contract.py` |
| 9 | Temporary compatibility logic needed an explicit review. | Confirmed the obsolete 422/page-variant workaround is gone. Remaining fallback/retry paths have bounded, documented responsibilities: `.hermes` compatibility, image placement, AI structured-output fallback, and 401 pairing refresh. No safe deletion was identified, so no empty cleanup commit was created. | Focused source search plus capability-negotiation tests |

## Deliberately not done

- No global `Hermes` to `PageNest` rename; `.hermes` remains readable for compatibility.
- No split of `popup.js` or `rendering.py` into a new architecture.
- No new website adapter or feature work.
- No database, task queue, frontend framework, or dependency upgrade.
- No Obsidian Vault changes, user-data changes, or generated capture cleanup.
- No formatting-only rewrite and no deletion of legitimate legacy behavior.

## Validation evidence

The final local run completed successfully:

- Python: `111 passed in 3.79s`
- Ruff: `All checks passed!`
- JavaScript: all `tests/test_*.js` passed, including `test_link_normalization.js`; `node --check` passed for every test file.
- Repository validation: `Repository validation OK: 143 tracked files`
- Release metadata: `v1.8.0` accepted.
- Browser-store kit built successfully.
- Browser extension, Obsidian viewer, and Windows local-service release archives built successfully.
- `git diff --check` passed for the final tracked changes.

## Remaining risks and next review items

1. Run the clean Windows 10/11 installer smoke test with a fresh user profile, a new Obsidian Vault, Edge/Chrome extension installation, service startup, offline save, restart, and uninstall.
2. Run live capture regressions for representative Xiaohongshu and Guyue pages, including delayed shell, lazy images, login-required content, and pages that change their DOM shape.
3. Review DNS-rebinding/redirect behavior and the downloader's network policy with a dedicated security test matrix.
4. Consider a later, separately reviewed split of the popup service client and renderer modules only after the current contracts have remained stable.
5. Keep `audit-info/` and `PageNest-audit.zip` outside commits; they are audit artifacts, not product source.

## Release judgment

**Status: blocked pending environment and live-site validation.** The code-level hardening and package checks are green, but automated local tests cannot prove that a clean Windows installation, a fresh Vault, or current third-party site markup will work end-to-end. No GitHub repository, push, or Release operation is performed by this hardening pass.
