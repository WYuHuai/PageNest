# Certification reviewer notes

PageNest Web Collector depends on two local companion components. This
dependency is disclosed in the store listing.

## Test setup

1. On Windows 10/11, run `PageNest-Setup-1.7.4.exe`.
2. Select an Obsidian vault that already contains a `.obsidian` directory.
3. In Obsidian, enable **PageNest Viewer** under Community plugins.
4. Install PageNest from this store test channel.
5. Open a public article such as `https://example.com/` and click PageNest.
6. Choose **Complete page (no AI)** and save.
7. Confirm that one `.pagenest` file appears in the selected vault and opens in
   PageNest Viewer.

The submitted installer is built with this store item's fixed extension ID.
When the popup first opens without a saved token, the local service releases its
random token only to that exact allowlisted extension origin and stores it in
browser-local extension storage. Reviewers do not need a token or account.

Do not submit this package if automatic pairing has not passed on a clean test
machine. Never put a real token in reviewer notes or the extension ZIP.

## Expected behavior

- The extension processes only the tab on which the user clicks it.
- Core functionality uses `127.0.0.1:8765`; there is no PageNest cloud service.
- No account or test credentials are required.
- Select original mode for certification; AI organization is optional.
- Bilibili or other media capture is intended only for content the user is
  authorized to archive and does not bypass paywalls or authentication.
