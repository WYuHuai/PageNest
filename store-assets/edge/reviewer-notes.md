# PageNest 1.10.2 certification notes

PageNest depends on the companion PageNest Windows Local Service, which is
clearly disclosed in the listing. No PageNest account or test credential is
required.

## Changes in 1.10.2

- Added structured knowledge summaries for user-invoked Video Notebook frames,
  including content, key knowledge, visible details, and insufficient-context
  notices when applicable.
- Improved bounded AI response parsing for real OpenAI-compatible providers.
- Web Capture now makes AI failures explicit while preserving the captured page,
  and makes at most two provider requests.
- Removed the collection-note field from new captures and clarified save-mode
  speed expectations.
- Added a narrowly scoped `wechat-article` path that preserves safe visual
  styles and improves inline-image handling.
- Permission set did not increase.
- No `downloads`, `nativeMessaging`, `management`, `tabs`, `tabCapture`, or
  `offscreen` permission is requested.
- Existing user-invoked Web Capture behavior remains.

## Shortest basic test

1. Install this submission from the Edge test channel. The Welcome page opens
   only for this fresh installation.
2. Choose **Install PageNest**, run `PageNest-Setup.exe`, and select an existing
   Obsidian Vault containing a `.obsidian` directory.
3. Return to the extension, choose **Check again**, and confirm **PageNest
   connected**.
4. Open `https://example.com/`, open PageNest, choose **Webpage**, and
   save. AI is not required.
5. Confirm one `.pagenest` file appears in the selected Vault.
6. Restart Obsidian once, enable **PageNest Viewer** under Community plugins,
   and open the saved file.

The installer is built with this Edge item's fixed extension ID. On first use,
the loopback Service releases its random token only to that allowlisted extension
origin and stores it in browser-local extension storage. Do not add a token or AI
key to reviewer notes. Video capture should be tested only on content the tester
is authorized to save; PageNest does not bypass authentication, paywalls, or DRM.
