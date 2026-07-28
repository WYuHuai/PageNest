# PageNest v1.7.4

This release contains browser extension 1.7.4, Windows local service 1.7.4,
and PageNest Viewer 1.3.0.

## Highlights

- Single-file `.pagenest` offline collections with embedded images, GIFs, and
  supported media; legacy `.hermes` files remain readable.
- Dedicated Feishu, WeChat, CSDN, and Bilibili capture paths.
- Secure Obsidian iframe copy bridge without `allow-same-origin`.
- Authenticated local API, restricted CORS, privacy-safe status output, guarded
  downloads, and bounded resource usage.
- Original content still saves when the optional organizer fails.
- Per-user Windows installer with a bundled Python runtime, automatic local
  token pairing for its bundled unpacked extension, viewer installation, and
  sign-in startup.

## Install

1. Verify `PageNest-Setup-1.7.4.exe` with its `.sha256` file, then run it and
   select an Obsidian vault.
2. In Edge or Chrome, load the unpacked extension from
   `%LOCALAPPDATA%\Programs\PageNest\Extension`.
3. Restart Obsidian and enable **PageNest Viewer** under Community plugins.

The separate extension, viewer, and source-service ZIP files are alternative
manual/developer packages; normal Windows users need only the installer.

## Important

PageNest Viewer is required for supported `.pagenest` rendering in Obsidian.
Do not share installed `.env` files, connection configuration, collector tokens,
private pages, logs, or vault contents.
