# Hermes Obsidian Web Collector

[English](README.md) · [快速安装](#快速安装) ·
[支持网站](docs/supported-sites.md) ·
[技术架构](docs/architecture.md) · [路线图](ROADMAP.md)

Hermes 是面向 Windows、Edge/Chrome 和 Obsidian 的本地优先网页收藏工具。
它在浏览器中采集文章，通过本地服务生成单个自包含 `.hermes` 离线页面，
再由 Obsidian 查看器安全打开。智能整理是可选功能，可连接 OpenAI Chat
Completions 兼容接口。

> Hermes 由三个必要组件组成：浏览器扩展、Windows 本地服务、Obsidian
> 查看器。只安装浏览器扩展不能完成收藏和阅读。

## 主要功能

- 将正文、排版、图片、GIF、链接和支持的视频保存到单个 `.hermes` 文件。
- 原网页失效或断网后，已嵌入内容仍可阅读。
- 保留图片原位、标题层级、代码块、外部仓库链接和独立收藏备注。
- 支持普通文章，并为飞书、微信、CSDN 和 B站提供专用适配。
- 通过已登录浏览器读取飞书受保护图片，保留 Canvas 内容。
- 保存 B站视频信息，支持的媒体可合并为受限的 360p MP4。
- 动态扫描 Obsidian 仓库文件夹。
- 提供仅保存原文、AI 文字整理和 AI 图文整理三种模式。
- AI 接口失败时仍保存原文和已下载图片。

## 三个组件怎样协作

```mermaid
flowchart LR
    E["Edge / Chrome 扩展"] -->|"带令牌的采集数据"| S["本地服务<br/>127.0.0.1:8765"]
    S -->|"单个自包含文件"| V["Obsidian 仓库<br/>*.hermes"]
    V --> P["Hermes Page Viewer"]
    S -. "可选" .-> A["OpenAI 兼容接口"]
```

扩展负责读取当前网页，本地服务负责清理、下载、整理和写入文件，Obsidian
插件负责注册 `.hermes` 扩展名并在受限 iframe 中显示离线页面。

详细边界见[架构与数据流](docs/architecture.md)。

## 快速安装

### 环境要求

- Windows 10 或 11
- Python 3.11 或更高版本
- Microsoft Edge 或 Google Chrome
- Obsidian 1.5.0 或更高版本

### 1. 安装本地服务

1. 下载并解压 Windows 本地服务安装包。
2. 双击 `安装依赖.bat`。
3. 打开 `local-server\.env`。
4. 将 `OBSIDIAN_VAULT_PATH` 设置为 Obsidian 仓库绝对路径。
5. 在 PowerShell 生成令牌：

   ```powershell
   [guid]::NewGuid().ToString("N")
   ```

6. 将令牌填入 `LOCAL_COLLECTOR_TOKEN`。
7. 双击 `启动网页收藏器.bat`。

不要提交或分享真实的 `local-server\.env`。

### 2. 安装浏览器扩展

1. 打开 `edge://extensions/` 或 `chrome://extensions/`。
2. 开启“开发人员模式”。
3. 解压浏览器扩展安装包。
4. 点击“加载解压缩的扩展”，选择含 `manifest.json` 的目录。
5. 打开 Hermes 弹窗，在连接设置中填写 `http://127.0.0.1:8765`
   和相同的收藏器令牌。

### 3. 安装 Obsidian 查看器

1. 将查看器解压到：

   ```text
   <仓库>\.obsidian\plugins\hermes-page-viewer\
   ```

2. 确认目录中直接包含 `main.js`、`manifest.json` 和 `styles.css`。
3. 重启 Obsidian，在“第三方插件”中启用 **Hermes Page Viewer**。

没有安装这个插件时，Obsidian 不认识 `.hermes` 文件。

## `.hermes` 是什么

`.hermes` 是经过清理的 UTF-8 自包含 HTML 文档，图片和支持的媒体直接嵌在
文件内。它不是加密格式，更接近“离线收藏成品”，而不是用于继续编辑的
Markdown 笔记。

独立扩展名让 Obsidian 可以调用受限的 Hermes 查看器，也为将来的格式版本和
索引信息留出空间。应急时可以复制一份并改名为 `.html` 使用浏览器打开，但
Obsidian 查看器才是正式支持的阅读方式。

## 支持网站

| 网站 | 当前能力 |
| --- | --- |
| 普通文章网站 | 正文、标题层级、图片、链接、代码和尽力保留的排版 |
| 飞书文档 | 虚拟区块、登录图片、嵌入文档、Canvas 兜底 |
| 微信公众号 | 正文清理、懒加载图片和占位图过滤 |
| CSDN | 文章排版、代码配色、折叠/复制和外部仓库链接 |
| B站 | 视频页、专栏、动态、元数据和支持的媒体采集 |

完整说明见[网站支持矩阵](docs/supported-sites.md)。

## 浏览器权限

| 权限 | 用途 |
| --- | --- |
| `activeTab`、`tabs` | 识别并采集用户主动打开的网页 |
| `scripting` | 向当前网页注入提取器和网站适配器 |
| `storage` | 保存本地服务地址、令牌和用户设置 |
| `clipboardWrite` | 用户主动操作时复制路径或代码 |
| `<all_urls>` | 支持任意文章网站和页面内签名资源 |

网页内容只发送到用户配置的本地服务；只有用户主动选择 AI 模式时，才会发送到
用户配置的智能整理接口。项目没有遥测和分析代码。

## 安全设计

- 本地服务只监听 `127.0.0.1:8765`。
- API 必须携带本地令牌。
- CORS 只接受 Chromium 扩展来源。
- 默认阻止环回、局域网、链路本地和云元数据下载地址。
- 每次重定向都会重新验证，并在下载过程中限制大小。
- 限制请求体、正文、图片、媒体、数量和并发任务。
- 查看器不执行收藏网页脚本，也不加载远程图片。
- 代码复制使用每次渲染随机生成的消息通道。

详情见 [SECURITY.md](SECURITY.md) 和 [PRIVACY.md](PRIVACY.md)。

## 开发与测试

```powershell
python -m venv local-server\.venv
local-server\.venv\Scripts\python -m pip install -r local-server\requirements-dev.txt
local-server\.venv\Scripts\python -m pytest -q

Get-ChildItem extension,obsidian-plugin,tests -Recurse -Filter *.js |
  ForEach-Object { node --check $_.FullName }
Get-ChildItem tests -Filter "test_*.js" |
  ForEach-Object { node $_.FullName }
```

发布打包与验收见[发布检查清单](docs/release-checklist.md)。

## 项目状态

组件兼容关系见[版本兼容说明](docs/version-compatibility.md)，后续计划见
[ROADMAP.md](ROADMAP.md)。

## 参与贡献

提交问题或代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。不要上传私人网页、
知识库内容、API Key 或未脱敏日志。

## License

[MIT](LICENSE)
