# PageNest 1.10.0 certification notes

PageNest depends on the companion PageNest Windows Local Service, which is
clearly disclosed in the listing. No PageNest account or test credential is
required.

## Major changes in 1.10.0

- Added user-invoked Video Notebook screenshot capture.
- Captures the current decoded `HTMLVideoElement` frame directly.
- Added Standard and High PNG quality profiles.
- Added optional local-Service-backed AI frame title and summary generation.
- Permission set did not increase.
- No `tabCapture` or `offscreen` permission is requested.
- Existing user-invoked Web Capture behavior remains.

## Shortest basic test

1. On Windows 10/11, run `PageNest-Setup-1.10.0.exe` and select an existing
   Obsidian Vault containing a `.obsidian` directory.
2. Install this submission from the Edge test channel.
3. Open `https://example.com/`, open PageNest, choose **Complete webpage**, and
   save. AI is not required.
4. Confirm one `.pagenest` file appears in the selected Vault.
5. Restart Obsidian once, enable **PageNest Viewer** under Community plugins,
   and open the saved file.

The installer is built with this Edge item's fixed extension ID. On first use,
the loopback Service releases its random token only to that allowlisted extension
origin and stores it in browser-local extension storage. Do not add a token or AI
key to reviewer notes. Video capture should be tested only on content the tester
is authorized to save; PageNest does not bypass authentication, paywalls, or DRM.
