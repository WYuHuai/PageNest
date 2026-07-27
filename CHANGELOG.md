# Changelog

## 1.7.4 - 2026-07-27

- Preserve CSDN/Highlight.js syntax tokens with readable offline colors.
- Add collapsible toolbars for long code blocks and copy clean source lines without line-number markup.
- Make Obsidian code copying reliable with a direct iframe click bridge plus the existing message fallback.
- Preserve GitHub, Gitee, and GitCode destinations stored in CSDN data attributes and reporting payloads.

## 1.7.3 - 2026-07-27

- Preserve Feishu canvas tables at their actual on-screen aspect ratio instead of the canvas buffer ratio.
- Skip transparent Feishu helper canvases that previously became large blank gaps.
- Enable CSDN code-copy buttons inside the sandboxed Obsidian page viewer.
- Remove the “与现有项目的关系” and “后续行动” AI cards.

## 1.7.2 - 2026-07-26

- Add readable offline code blocks with a built-in copy button.
- Preserve and normalize external links, including CSDN redirect links to GitHub.
- Crop blank Feishu canvas margins and preserve image aspect ratio.
- Tighten Feishu document spacing for a more natural reading layout.

## 1.7.1 - 2026-07-26

- Restore clean Feishu document titles and Chinese interface labels in offline pages.
- Stitch scrollable Feishu canvas regions so tables are not clipped to the visible viewport.
- Discover Bilibili video IDs from embedded frames, page markup, and player network resources.

## 1.7.0 - 2026-07-26

- Download protected Feishu images from the signed-in extension context before sending the capture to the local service.
- Preserve Feishu canvas-based tables as inline images and render Feishu documents with a source-like layout.
- Create a Bilibili video download job from the page BVID even when the player has not mounted a `<video>` element yet.
- Rebuild older captures with capture protocol 8.

## 1.6.0 - 2026-07-26

- Prefer the real top-level Feishu virtual document over navigation and embedded-player frames.
- Treat embedded players as media-only frames so progress, speed, quality, and fullscreen labels never enter article text.
- Preserve animated GIF bytes and validate that all animation frames survive embedding.
- Add a dedicated video pipeline with direct-video capture and Bilibili audio/video merging through yt-dlp and FFmpeg.
- Rebuild older captures with capture protocol 7.


## 1.5.0 - 2026-07-26

- Preserve Feishu image position markers inside embedded ISV frames with conservative cleanup.
- Prefer frame captures with complete image-marker coverage and report marker loss explicitly.
- Add a Bilibili Opus collector that keeps the primary video frame, author, title, and post body while excluding player chrome and unrelated page images.
- Render Bilibili Opus captures with a dedicated Bilibili-style self-contained offline page.


## Unreleased

- Capture Feishu cross-origin ISV document frames and select the most complete frame result.
- Add Bilibili video-specific extraction for cover, creator, publish date, duration, description, chapters, tags, notes, and note images.
- Report incomplete media explicitly instead of presenting a partial save as fully successful.

- Filter empty WeChat lazy-loading SVG placeholders before download and rendering.
- Respect an explicitly selected vault folder even when another folder contains a duplicate URL.
- Hide the internal `.hermes` file-type badge and use provider-neutral AI labels.

- Rebuild Feishu virtual-document capture around stable block/image position IDs.
- Refresh a block snapshot when delayed images make it more complete.
- Preserve repeated image URLs at every document position instead of URL-deduplicating them.
- Use strict Feishu placement: unmatched images are reported, never silently appended.

## 1.0.0 - Unreleased

- Save complete webpages as single self-contained `.hermes` files.
- Add dynamic Obsidian folder discovery and manual folder selection.
- Add optional OpenAI-compatible intelligent organization.
- Add lazy-image and CSS-background extraction.
- Preserve a unique DOM position ID for every image and restore embedded data at the exact original node.
- Retain text-context placement only for captures made by older extension versions.
- Run quick text organization concurrently with image downloads.
- Add Obsidian page viewer, security controls, tests, and GitHub CI.
