# PageNest 1.10.1

PageNest 1.10.1 is a focused first-run experience patch for Microsoft Edge
users. Capture, Video Notebook, AI, Viewer, storage, and security behavior are
unchanged from 1.10.0.

## Changes

- Added a first-install Welcome page that does not reopen on extension updates.
- Added an in-Popup **Install PageNest** action when the Windows companion is
  unavailable.
- Added direct **Check again** and distinct connected, update-required, and
  connection-repair states.
- Added the stable `PageNest-Setup.exe` release alias used by the extension.
- Completed Simplified Chinese and English onboarding localization.

The extension downloads the installer from a fixed HTTPS GitHub Release URL.
It never runs the executable, bypasses Windows security prompts, or requests
browser download/native-messaging permissions.
