<p align="center"><img src="docs/assets/pagenest-icon-256.png" alt="PageNest" width="112"></p>
<h1 align="center">PageNest</h1>
<p align="center"><strong>把网页和 B 站视频，变成真正属于你的本地笔记。</strong></p>
<p align="center">完整保存网页，在 B 站视频关键处截下画面，并按时间线整理到 Obsidian；AI 标题与摘要可选，原始内容始终优先保留。</p>

<p align="center">
  <a href="https://github.com/WYuHuai/PageNest/releases/tag/v1.10.1"><img alt="PageNest v1.10.1" src="https://img.shields.io/badge/release-v1.10.1-1E45FB"></a>
  <a href="https://github.com/WYuHuai/PageNest/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/WYuHuai/PageNest/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-11%20validated-0078D4?logo=windows">
  <img alt="Microsoft Edge" src="https://img.shields.io/badge/Browser-Microsoft%20Edge-0A84FF?logo=microsoftedge">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
</p>

<p align="center">
  <strong>简体中文</strong> ·
  <a href="README.en.md">English</a> ·
  <a href="https://github.com/WYuHuai/PageNest/releases/latest/download/PageNest-Setup.exe">下载 Windows Installer</a> ·
  <a href="docs/feature-gallery.html">交互式功能演示</a> ·
  <a href="docs/troubleshooting.md">故障排查</a>
</p>

## PageNest 是什么？

PageNest 是一款面向 Windows、Microsoft Edge 和 Obsidian 的本地优先收藏工具。它解决的不是“再存一个链接”，而是把值得保留的网页正文、图片、代码和排版保存为可移动的 `.pagenest` 文件；观看 B 站视频时，还能用快捷键保存关键画面，自动组成带时间戳的 Video Notebook。

核心采集不依赖 AI。需要进一步整理时，你可以连接自己选择的 OpenAI-compatible 服务，为截图生成标题和摘要；AI 失败不会删除原始截图。

## 核心能力

- **完整保存网页：** 正文、原位图片、GIF、代码、表格、链接和尽力保留的排版，统一写入一个本地文件。
- **Video Notebook：** 在 B 站视频页按 `Ctrl+Shift+Y`，直接保存当前解码画面。
- **自动时间线：** 连续保存的 B 站视频截图进入同一本 Video Notebook，并按视频时间自动排序。
- **可选视觉 AI：** 使用用户自己配置的 provider 生成标题与摘要；未配置 AI 也能保存网页和 B 站视频截图。
- **本地优先：** 核心内容写入用户选择的 Vault，没有 PageNest 云账号、广告或遥测。

## 功能展示

以下图片使用无隐私的演示内容，展示 PageNest 的五条核心使用路径。点击图片可以查看原图。

<table>
  <tr>
    <td width="50%" align="center">
      <a href="store-assets/edge/screenshots/01_web_capture.png"><img src="store-assets/edge/screenshots/01_web_capture.png" alt="Web Capture：收藏网页，而不是链接"></a><br>
      <strong>Web Capture</strong><br><sub>把正文、图片、代码和排版完整保存到本地。</sub>
    </td>
    <td width="50%" align="center">
      <a href="store-assets/edge/screenshots/02_video_notebook.png"><img src="store-assets/edge/screenshots/02_video_notebook.png" alt="Video Notebook：B 站视频关键帧时间线"></a><br>
      <strong>Video Notebook</strong><br><sub>一键保存 B 站关键画面，并按视频时间自动整理。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="store-assets/edge/screenshots/03_vision_ai.png"><img src="store-assets/edge/screenshots/03_vision_ai.png" alt="Vision AI：自动生成标题与摘要"></a><br>
      <strong>Vision AI</strong><br><sub>使用你配置的 AI 服务生成标题与摘要，原图始终保留。</sub>
    </td>
    <td width="50%" align="center">
      <a href="store-assets/edge/screenshots/04_lightbox.png"><img src="store-assets/edge/screenshots/04_lightbox.png" alt="Viewer Lightbox：在 Obsidian 里沉浸阅读"></a><br>
      <strong>Viewer Lightbox</strong><br><sub>大图、时间戳、标题和摘要在 Obsidian 中一起查看。</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <a href="store-assets/edge/screenshots/05_local_first.png"><img src="store-assets/edge/screenshots/05_local_first.png" alt="First-run onboarding：首次安装与重新检测" width="64%"></a><br>
      <strong>First-run onboarding / Local-first</strong><br><sub>第一次打开即可完成本地组件安装、重新检测并确认连接。</sub>
    </td>
  </tr>
</table>

<p align="center"><a href="docs/feature-gallery.html"><strong>▶ 查看完整交互式功能演示 / View interactive gallery</strong></a></p>

> GitHub README 只能显示静态图集。仓库中的 `docs/feature-gallery.html` 支持按钮、键盘方向键和缩略图切换；下载仓库后可直接用浏览器打开，也可以部署到 GitHub Pages。

## 安装 PageNest

PageNest 的完整功能由 **Edge 扩展 + Windows 本地组件**共同提供。普通用户不需要理解端口、token 或内部服务。

> **当前版本提示（截至 2026 年 8 月 26 日）：** Edge Add-ons 仍展示 PageNest `1.8.1`。`1.10.1` 更新正在审核，预计审核流程约需 7 个工作日。商店完成更新前，建议使用下面的 **手动安装** 获取当前版本。

### 手动安装

> **GitHub 提供 ZIP 下载，但不能直接在 Edge 里安装 ZIP，必须先解压。** 当前 Edge Add-ons 仍是旧版本，因此这是现阶段安装 `1.10.1` 扩展的合适方式。

1. 下载当前版本的 **[Extension ZIP](https://github.com/WYuHuai/PageNest/releases/download/v1.10.1/pagenest-browser-extension-v1.10.1.zip)**。
2. 把 ZIP 完整解压到一个固定文件夹；不要直接选择 ZIP 文件，也不要在压缩软件预览窗口中加载。
3. 在 Edge 地址栏打开 `edge://extensions`。
4. 打开右上角的 **开发人员模式**。
5. 点击 **加载已解压的扩展程序**。
6. 选择刚才解压后的扩展文件夹；该文件夹内应直接包含 `manifest.json`。
7. 如需保存到本地和连接 Obsidian，仍需安装 **[PageNest Windows Installer](https://github.com/WYuHuai/PageNest/releases/latest/download/PageNest-Setup.exe)**。
8. 安装完成后回到扩展点击 **重新检测**，确认显示 **PageNest 已连接**。

手动加载的扩展不会像 Edge Add-ons 商店版一样自动更新。恢复使用商店版后，请移除手动加载的副本，避免同时存在多个 PageNest。

### 推荐安装

Edge Add-ons 更新到 `1.10.1` 后，推荐使用商店版本，以便后续自动更新：

1. 从 Microsoft Edge Add-ons 安装 **PageNest 网页与视频笔记**，并确认版本不低于 `1.10.1`。
2. 第一次打开扩展，点击 **安装 PageNest**；也可以直接下载并运行稳定安装包：**[PageNest-Setup.exe](https://github.com/WYuHuai/PageNest/releases/latest/download/PageNest-Setup.exe)**。
3. 安装完成后回到扩展，点击 **重新检测**。
4. 看到 **✓ PageNest 已连接**即可开始使用。

安装器会安装并启动本地组件，把 PageNest Viewer 放入你选择的 Obsidian Vault，并配置扩展与本机服务的安全连接。无需安装 Python 或 Node.js，也无需手工填写端口或 token。

## 第一次使用

### 保存网页

打开网页 → 点击 PageNest → 选择保存模式和位置 → 点击 **保存到 Obsidian**。

### 建立 B 站 Video Notebook

打开 B 站视频 → 按 `Ctrl+Shift+Y` → 当前画面立即保存 → 连续截图按视频时间进入同一本 Notebook。已配置视觉 AI 时，标题和摘要会随后写回。

Video Notebook 目前以已经实机验证的 B 站视频场景为准。B 站播放器实现、跨域限制、DRM 或低分辨率解码源仍可能阻止干净帧捕获；PageNest 不绕过认证、付费墙、访问控制或 DRM。

## 常见问题

### 只安装 Edge 扩展能不能用？

可以打开扩展并查看安装引导，但**不能获得完整的本地保存能力**。写入 `.pagenest`、管理 Vault、部署 Viewer 和安全配对都需要 Windows 本地组件。

### 为什么还要安装本地组件？

浏览器扩展不能直接承担完整的本地文件管理和 Obsidian 集成。本地组件只监听 `127.0.0.1`，负责把内容安全写入你选择的 Vault、维护 Notebook，并与 Viewer 协作。

### 能不能不用 GitHub？

Edge Add-ons 更新到 `1.10.1` 后可以不用 GitHub：直接从商店安装扩展，再按扩展内的 **安装 PageNest** 引导运行 Windows Installer。当前审核期间如果需要安装 `1.10.1`，则需要使用 GitHub 的 **手动安装** 步骤。

### Obsidian 是否必需？

PageNest 生成的是本地 `.pagenest` 文件；官方安装和阅读流程以 Obsidian Vault 与 PageNest Viewer 为目标。如果只想保留文件，可以把它们作为本地归档，但要获得完整的 Vault 管理和 Viewer 阅读体验，建议安装 Obsidian。

### AI 是否必须配置？

不需要。普通网页保存、B 站视频截图和时间线整理都不依赖 AI。只有自动标题与摘要需要用户主动配置兼容的 AI provider；启用后，完成请求所需的正文或图片会发送给该用户选择的 provider。

## 隐私与使用边界

- 扩展只在用户点击保存或按下 B 站视频截图快捷键时处理当前页面。
- 核心内容默认保存到用户选择的本地 Vault；PageNest 不出售数据，不含广告、遥测或分析 SDK。
- 原始保存模式不向 AI provider 发送内容；AI 功能只在用户配置并触发相应模式时使用该 provider。
- Viewer 渲染收藏内容时不会执行被收藏网页中的脚本。
- 用户应只保存自己有权留存的内容。

详见 [隐私政策](PRIVACY.md)、[安全边界](SECURITY.md)、[支持矩阵](docs/supported-sites.md)和[故障排查](docs/troubleshooting.md)。

## 开发者与架构

内部数据流与安全边界见[架构文档](docs/architecture.md)、[版本兼容说明](docs/version-compatibility.md)和 [v1.10.1 Release Notes](docs/release-notes-v1.10.1.md)。源码构建、测试和贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

需要独立组件的用户可以在 [GitHub Release](https://github.com/WYuHuai/PageNest/releases/tag/v1.10.1) 中取得 Extension、Service 和 Viewer 压缩包；Edge Add-ons 更新到当前版本后，普通用户可改用商店扩展与 Windows Installer。

## License

[MIT](LICENSE)
