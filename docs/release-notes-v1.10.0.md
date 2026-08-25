# PageNest v1.10.0

PageNest 1.10.0 adds a bounded Video Notebook workflow while preserving the
local-first, single-file capture model. This release contains browser extension
1.10.0, Windows local service 1.10.0, and independently versioned PageNest
Viewer 1.5.0.

## Added / 新增

- **Video Notebook capture / 视频画面笔记** — Press the configured shortcut to
  capture a clean frame from a top-frame HTML video. The notebook is created on
  the first successful capture, and entries are displayed by video timestamp.
- **Vision titles and summaries / 视觉标题与摘要** — A configured,
  vision-capable OpenAI-compatible model can describe each frame. The screenshot
  remains saved when analysis is unsupported, unavailable, or fails.
- **Capture quality profiles / 截图质量档位** — Standard and High PNG modes
  preserve the decoded video frame at bounded dimensions.
- **Viewer Lightbox / Viewer 大图预览** — Click a Video Notebook screenshot in
  Obsidian to view the enlarged image with its title, summary, and timestamp.

## Improved and fixed / 改进与修复

- Capture the decoded video frame directly instead of using the renderer-risky
  visible-tab path, and ignore tracking parameters when matching notebook
  sources.
- Keep entries in timeline order and preserve screenshot data plus bounded
  failure metadata during low-memory or provider-error paths.
- Accept valid vision JSON wrapped in Markdown fences and perform one bounded
  non-structured retry when structured output is invalid.
- Normalize malformed nested headings in legacy WeChat captures without
  shrinking ordinary article headings.
- Reuse an existing effective CSP nonce for Viewer runtime enhancements, while
  retaining fail-closed behavior for unsupported policies.

## Known limitations / 已知限制

- Video Notebook capture currently supports top-frame videos only. Cross-frame
  players are not captured by this workflow.
- DOM overlay subtitles and danmaku are not guaranteed to appear in the direct
  video frame.
- Protected or DRM media may be unavailable.
- High quality does not upscale a low-resolution decoded source frame. Final
  clarity still depends on the source stream's resolution and quality.
- Restart or reload Obsidian after updating PageNest Viewer so the new plugin
  runtime is loaded.

## Install or upgrade / 安装或升级

Download and run `PageNest-Setup-1.10.0.exe`, select the existing Obsidian
Vault, then reload the unpacked browser extension and restart Obsidian. Existing
configuration and saved `.pagenest` files are preserved.

The installer is unsigned, so Windows SmartScreen may display an unknown
publisher warning. Verify the published SHA-256 checksum before installation.
