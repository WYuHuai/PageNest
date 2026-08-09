# PageNest 1.8.0 Compatibility Matrix

Validated source commit: `9b3d046a558a024718aa398e6b93218e0b80a740`
Validation date: 2026-08-09

## Version contract

| Component | Version | Definition |
| --- | --- | --- |
| Browser extension | 1.8.0 | `extension/manifest.json` |
| Local service | 1.8.0 | `local-server/collector/main.py` |
| Obsidian Viewer | 1.3.0 | `obsidian-plugin/pagenest-viewer/manifest.json` |
| API protocol | 1 | `local-server/collector/main.py`, `release-manifest.json` |
| `.pagenest` format | 1 | `local-server/collector/rendering.py`, `release-manifest.json` |
| Capture protocol | 12 | `extension/extractor.js`, `release-manifest.json` |

The Viewer has independent versioning and is **1.3.0**, not 1.8.0. No Viewer 1.8.0 artifact exists, so a matrix row claiming Viewer 1.8.0 would be inaccurate.

## Matrix

`PASS` means the stated path was exercised. `PARTIAL` means only the named contract or automation was exercised. `NOT TESTED` is not treated as a pass.

| Combination | Result | Evidence and limits |
| --- | --- | --- |
| Extension 1.8.0 + Service 1.8.0 | PASS | `/api/meta` contract tests pass. Actual Edge captured both a standard HTTP page and a `file://` HTML page through the frozen service. Save and duplicate detection passed. |
| Extension 1.8.0 + Service 1.8.0 + Viewer 1.3.0 | PARTIAL | Installer placed all Viewer files and a saved `.pagenest` rendered correctly in Edge. The file was not opened interactively inside Obsidian during this run. |
| Extension 1.8.0 + Service 1.7.4 | PARTIAL | The shipped 1.7.4 service has no `/api/meta`. `tests/test_service_capabilities.js` verifies that 1.8.0 stops with an explicit upgrade message rather than trying a 422-based downgrade. A full installed pair was not run. |
| Extension 1.7.4 + Service 1.8.0 | NOT TESTED | The 1.8.0 request model keeps the new source fields optional, but the released 1.7.4 extension was not driven against the 1.8.0 service in a browser. |
| Viewer 1.3.0 + new format-1 `.pagenest` | PARTIAL | Registration, sandbox and copy bridge are covered by JavaScript tests; the generated file rendered outside Obsidian. Actual Obsidian UI was not exercised. |
| Viewer 1.3.0 + older `.pagenest` | PARTIAL | File-format compatibility remains `1.x` and automated Viewer registration passes. No historical fixture was opened in Obsidian in this run. |
| Viewer 1.3.0 + legacy `.hermes` | PARTIAL | `.hermes` registration and conflict handling pass automated tests. No legacy file was opened in Obsidian in this run. |
| Older Viewer + new 1.8.0 `.pagenest` | NOT TESTED | No old Viewer installation was available for an actual UI test. |

## Current protocol behavior

- Extension 1.8.0 requires a successful `/api/meta` capability response before collection.
- Unsupported `page_variant` values are rejected before `/api/collect`; they are not silently removed.
- Service 1.8.0 reports API protocol 1 and `.pagenest` format 1.
- Local HTML adds optional `source_kind` and `source_name` fields without increasing the API protocol number.
- The server-side downloader remains HTTP(S)-only; `file://` is rejected.

## Upgrade coverage

The v1.8.0 installer was installed twice into a fresh temporary directory. It preserved the generated token, selected Unicode Vault, service URL and extension configuration. This proves same-version repair/overwrite behavior only. A real **1.7.4 → 1.8.0** installed upgrade remains `NOT TESTED`.
