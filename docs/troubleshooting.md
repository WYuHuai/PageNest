# Troubleshooting

## The extension says the local service is not running

Normally, the installer starts PageNest Service immediately and registers it
to start after Windows sign-in. The extension can use its existing token to
rediscover the service on the restricted known local ports `8765`, `18765`,
and `28765`.

If the popup still reports that it is disconnected:

1. Open **Settings** in the PageNest popup and choose **Reconnect**.
2. Check that **PageNest Service** is present in the installed PageNest folder.
3. Open **PageNest 运行状态** from the Start menu to inspect the current
   connection state.
4. If the service is not running, start **PageNest** from the Start menu once.
5. If reconnection still fails, rerun the installer to repair the installed
   service, startup entry, extension configuration, and Viewer files.

Manual service startup is a recovery step, not part of normal daily use. Do not
disable authentication or copy tokens into public issue reports.

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

## I want to use a different Obsidian vault

Open **PageNest → Settings → Current Vault → Change Vault** and choose the new
vault. PageNest validates the folder, remembers the selection, rescans its
folders, and uses it for future collections. Files in the old vault are not
moved or deleted.

The adjacent refresh icon only rescans folders inside the current vault; it
does not change the vault.

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

Confirm that PageNest Viewer 1.4.0 or newer is enabled, then reload the file.
The viewer uses a random message channel and the Electron clipboard fallback;
captured page scripts do not receive clipboard access.

## Where are the logs?

Installed runtime logs are under
`%LOCALAPPDATA%\Programs\PageNest\Service\logs`. Source-mode logs are under
`local-server\logs`. Review and sanitize them locally. Do not attach logs
publicly until tokens, paths, URLs, filenames, and private article content have
been removed.
