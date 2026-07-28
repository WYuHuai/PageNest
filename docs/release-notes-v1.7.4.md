# Hermes Obsidian Web Collector v1.7.4

This release contains:

- browser extension 1.7.4;
- Windows local service 1.7.4;
- Obsidian Page Viewer 1.3.0.

## Highlights

- Single-file `.hermes` offline collection with embedded images, GIFs, and
  supported media.
- Dedicated Feishu, WeChat, CSDN, and Bilibili capture paths.
- Secure Obsidian iframe copy bridge without `allow-same-origin`.
- Authenticated local API with restricted CORS and privacy-safe status output.
- Guarded network downloads with SSRF, redirect, byte, count, and concurrency
  limits.
- Original content still saves when the optional organizer fails.

## Install

Install all three packages in this order:

1. `hermes-local-server-windows-v1.7.4.zip`
2. `hermes-browser-extension-v1.7.4.zip`
3. `hermes-obsidian-viewer-v1.3.0.zip`

Follow the README inside the repository for configuration. Verify downloads
against `SHA256SUMS.txt`.

## Important

Hermes Page Viewer is required for supported `.hermes` rendering in Obsidian.
Do not share `local-server\.env`, collector tokens, private pages, or vault
contents.
