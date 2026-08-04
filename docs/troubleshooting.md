# Troubleshooting

## The extension says the local service is not running

1. Open the Start menu and run **PageNest**.
2. Open **PageNest 运行状态** from the Start menu. The installer records the
   selected address in `连接设置.txt`.
3. If another program uses port 8765, rerun the installer; it automatically
   falls back to 18765 or 28765 and preconfigures the extension accordingly.
4. If PageNest was installed over an older Hermes setup, stop the older local
   service and start PageNest again.

Source developers can instead run `启动网页收藏器.bat` after configuring
`local-server\.env`.

## The collector token is rejected

Confirm the unpacked browser extension was loaded from:

```text
%LOCALAPPDATA%\Programs\PageNest\Extension
```

The installer writes the same random token to the service and this extension
folder. If either installed configuration was edited, rerun the installer and
reload the extension. Source developers must keep `LOCAL_COLLECTOR_TOKEN` and
the extension connection setting identical.

A browser-store installation does not read the bundled extension folder. It can
auto-pair only when its exact 32-character extension ID is present in
`PAGENEST_EXTENSION_IDS`. Pre-public builds without assigned store IDs must use
the bundled unpacked extension or enter the token from `连接设置.txt` manually.

## Obsidian cannot open a `.pagenest` or `.hermes` file

Check that this folder exists inside the current vault:

```text
<vault>\.obsidian\plugins\pagenest-viewer\
```

It must directly contain `main.js`, `manifest.json`, `styles.css`, and
`versions.json`. Restart Obsidian and enable **PageNest Viewer**. Plugin
registration is per vault; saving a file does not enable the viewer.

## Images or video are missing

- Check the result panel for failed or unplaced counts.
- Reload the extension after upgrading it.
- Try the page after its images finish loading.
- Login-only, DRM, expiring, and strongly protected resources may remain
  unavailable.
- Keep `ALLOW_LOCAL_NETWORK_DOWNLOADS=false` unless the source is a trusted local
  site.

The original article still saves when optional AI organization fails.

## The status page does not show my vault path

This is intentional. `/status` is public on localhost and exposes only
configured/not-configured state. Authenticated API responses provide the
minimum operational information needed by the extension.

## A code-copy button does not work

Confirm that PageNest Viewer 1.3.0 or newer is enabled, then reload the file.
The viewer uses a random message channel and the Electron clipboard fallback;
captured page scripts do not receive clipboard access.

## Where are the logs?

Installed runtime logs are under
`%LOCALAPPDATA%\Programs\PageNest\Service\logs`. Source-mode logs are under
`local-server\logs`. Review and sanitize them locally. Do not attach logs
publicly until tokens, paths, URLs, filenames, and private article content have
been removed.
