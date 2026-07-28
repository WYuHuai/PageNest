# Troubleshooting

## The extension says the local service is not running

1. Run `启动网页收藏器.bat`.
2. Open `http://127.0.0.1:8765/status`.
3. Confirm that `local-server\.env` exists and contains a vault path.
4. Confirm that the extension service address is exactly
   `http://127.0.0.1:8765`.

## The collector token is rejected

`LOCAL_COLLECTOR_TOKEN` and the value saved in the extension must match
exactly. Generate a new value with:

```powershell
[guid]::NewGuid().ToString("N")
```

Restart the local service after changing `.env`.

## Obsidian cannot open a `.hermes` file

Check that this folder exists inside the current vault:

```text
<vault>\.obsidian\plugins\hermes-page-viewer\
```

It must directly contain `main.js`, `manifest.json`, and `styles.css`. Restart
Obsidian and enable **Hermes Page Viewer**. The registration is per vault; saving
a `.hermes` file does not register the extension automatically.

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

Confirm that Hermes Page Viewer 1.3.0 or newer is enabled. Reload the file after
upgrading the plugin. The viewer uses a random message channel and the Electron
clipboard fallback; captured page scripts do not receive clipboard access.

## Where are the logs?

Runtime logs are under `local-server\logs\`. Review and sanitize them locally.
Do not attach logs publicly until tokens, paths, URLs, filenames, and private
article content have been removed.
