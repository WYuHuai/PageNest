# Changelog

All notable user-facing changes are recorded here.

## Unreleased

- Rename the public product to PageNest and save new collections as `.pagenest`.
- Keep PageNest Viewer compatible with collections previously saved as `.hermes`.
- Add a per-user Windows installer that bundles the Python runtime and local
  service, installs the viewer into a selected vault, preconfigures the browser
  extension connection, and enables startup at Windows sign-in.
- Add the PageNest brand icon to the extension, service, installer, and documentation.
- Prevent frozen-service startup crashes when Windows provides no console streams.
- Add a reproducible Chrome Web Store and Edge Add-ons submission kit with
  bilingual listing copy, privacy disclosures, reviewer notes, promotional
  assets, and a verified upload ZIP.
- Require HTTPS for remote AI organizer endpoints while retaining HTTP support
  for local loopback model servers.
- Add fail-closed automatic token pairing for store extensions whose exact IDs
  are configured in the Windows installer.

## 1.7.4 - 2026-07-27

- Add an authenticated, origin-restricted local API and privacy-safe status page.
- Add guarded image and media downloads with SSRF protection, redirect
  validation, byte limits, and an explicit local-network opt-in.
- Enforce request, article, image, media, item-count, and collection-concurrency
  limits.
- Split extraction and collection responsibilities into focused core, adapter,
  rendering, media, and security modules.
- Register a token-bound iframe copy bridge without `allow-same-origin`.
- Preserve readable CSDN syntax colors, collapsible code blocks, clean copied
  source, and external GitHub, Gitee, and GitCode destinations.

## 1.7.3 - 2026-07-27

- Preserve Feishu canvas tables at their on-screen aspect ratio.
- Skip transparent Feishu helper canvases that produced blank gaps.
- Enable code-copy controls inside the sandboxed Obsidian page viewer.

## 1.7.2 - 2026-07-26

- Add readable offline code blocks with built-in copy controls.
- Preserve and normalize external links, including CSDN redirect links.
- Crop blank Feishu canvas margins and preserve image aspect ratio.

## 1.7.1 - 2026-07-26

- Restore clean Feishu document titles and Chinese interface labels.
- Stitch scrollable Feishu canvas regions instead of clipping the viewport.
- Discover Bilibili video IDs from frames, markup, and player resources.

## 1.7.0 - 2026-07-26

- Download protected Feishu images through the signed-in extension context.
- Preserve Feishu canvas tables as inline images.
- Create Bilibili download jobs even before the page mounts a video element.

## 1.6.0 - 2026-07-26

- Prefer the real Feishu virtual document over navigation and player frames.
- Preserve animated GIF data.
- Add direct media capture and Bilibili audio/video merging through yt-dlp and
  FFmpeg.

## 1.5.0 - 2026-07-26

- Preserve Feishu image position markers in embedded document frames.
- Add dedicated Bilibili video, dynamic, and column rendering.
- Report incomplete media instead of presenting partial saves as complete.

## 1.0.0

- Save complete webpages as single self-contained `.hermes` files.
- Add dynamic Obsidian folder discovery and manual folder selection.
- Add optional OpenAI-compatible organization.
- Add lazy-image and CSS-background extraction.
- Add the Obsidian page viewer, security controls, and automated tests.
