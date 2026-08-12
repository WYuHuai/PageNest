# PageNest v1.8.0 — Public Beta

PageNest 1.8.0 focuses on reliability, local-first collection, and a smoother
browser-to-Obsidian workflow.

PageNest 1.8.0 专注于更可靠的本地优先收藏体验，以及更顺畅的浏览器到 Obsidian
工作流。

## Highlights / 主要更新

### Local HTML capture / 本地 HTML 收藏

Collect HTML files explicitly opened in Edge or Chrome, including the current
rendered DOM and browser-readable local images. Local absolute paths are not
sent to PageNest Service, and saved pages do not execute source JavaScript.

支持收藏用户在 Edge/Chrome 中主动打开的本地 HTML，保存当前渲染 DOM 和浏览器可
读取图片。本地绝对路径不会发送给 Service，离线成品也不会执行源 JavaScript。

### Better Xiaohongshu capture / 更好的小红书收藏

Improved asynchronous readiness, image carousel handling, and structured
rendering for comments already loaded by the website. Comment fields include
avatar, name, text, time, location, likes, and first-level replies when
available.

改进异步页面就绪判断、图片轮播和当前已加载评论的结构化显示。可用时会保留头像、
用户名、正文、时间、地区、点赞和一级回复。

### Guyue support / 古月居支持

Supports the current Guyue article structure and the known legacy
`.detail-fuwenben .html` layout, including article text and images.

支持古月居当前文章结构和旧 `.detail-fuwenben .html` 结构，保留正文与图片。

### Change Vault anytime / 随时更换知识库

Choose a different Obsidian vault from PageNest Settings after installation.
New collections use the new vault; existing files in the old vault are not
moved or deleted.

安装后可在 PageNest 设置中重新选择 Obsidian Vault。新收藏进入新 Vault，旧 Vault
文件不会移动或删除。

### Reliable local service / 更可靠的本地服务

The installer starts the service, registers Windows sign-in startup, enforces a
single instance, and lets the extension rediscover the authenticated service
across the restricted known local ports `8765`, `18765`, and `28765`.

安装后自动启动 Service，并注册 Windows 登录启动；单实例保护避免重复进程；扩展可
使用已有 token 在三个已知本地端口中有限重新发现 Service。

### Safer saves / 更安全的写入

Atomic writes reduce the risk of partial files. Duplicate protection avoids
creating `_2.pagenest` for the same source, and capability negotiation prevents
new clients from silently using unsupported older service behavior.

原子写入降低半成品文件风险，重复保护避免同一来源生成 `_2.pagenest`，能力协商则
避免新扩展静默调用旧 Service 不支持的行为。

## Install / 安装

1. Download `PageNest-Setup-1.8.0.exe` and its checksum from GitHub Releases.
2. Run the installer and choose an existing Obsidian vault. No Python, Node.js,
   or manual token setup is required.
3. Until Edge Add-ons is published, open `edge://extensions/`, enable Developer
   mode, choose **Load unpacked**, and select:

   ```text
   %LOCALAPPDATA%\Programs\PageNest\Extension
   ```

4. Restart Obsidian and enable **PageNest Viewer** under Community plugins.

完整中文步骤见 [安装说明](安装说明.html)。

## Verify the Windows installer

Current RC installer SHA-256:

```text
f7969ff80b4f24bd63b08e12554bb88f0aecfc466c73ee57d8670e7eab671602
```

This value must be recalculated from the final artifact before the Draft
Release is published. If the final installer changes, the final recalculated
hash is authoritative.

## Known limitations / 已知限制

- Windows 10 has not been fully validated.
- A persistent clean Windows 11 VM restart and sign-in cycle has not been
  completed. The real Windows 11 workflow, Windows CI, and automated Windows
  Sandbox installer smoke have been exercised.
- The installer is unsigned; Windows SmartScreen may show **Unknown
  publisher**.
- Website DOM changes can temporarily break dedicated adapters.
- Xiaohongshu comments include only content already loaded by the website.
- Logged-in Xiaohongshu behavior has not been fully tested.
- DRM, protected resources, expiring URLs, or strict anti-hotlinking may prevent
  some content from being saved.
- Complex Local HTML does not execute source JavaScript, and its original CSS
  is not guaranteed to reproduce 1:1.

## Documentation

- [README](../README.md) / [中文 README](../README.zh-CN.md)
- [Installation / 安装说明](安装说明.html)
- [Supported sites](supported-sites.md)
- [Troubleshooting](troubleshooting.md)
- [Security](../SECURITY.md)
- [Privacy](../PRIVACY.md)

## Release gate

This document prepares the v1.8.0 Public Beta Draft. It is not authorization to
publish. The sign-off decision accepts the explicitly documented Beta
validation gaps; it does not mark untested environments as passed. The Release
remains a draft until an explicit publish decision. The eventual title is
**PageNest v1.8.0 — Public Beta**.
