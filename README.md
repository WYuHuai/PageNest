# Hermes Obsidian Web Collector

一个面向 Windows、Microsoft Edge/Chrome 和 Obsidian 的本地网页收藏器。它把正文、排版和可下载图片封装成单个 `.hermes` 离线页面；原网页失效后，已内嵌的内容仍可阅读。智能整理是可选功能，可连接任意 OpenAI Chat Completions 兼容接口。

## 功能

- 自动提取正文、标题、图片、标题层级与来源信息。
- 飞书受保护图片由已登录的浏览器读取，画布型表格转成内嵌图片，并使用飞书专用离线版式。
- 飞书支持跨域嵌入正文与虚拟区块采集；B 站视频使用专用封面、简介、章节、标签和笔记版式；B 站动态/专栏（opus）使用接近原站的独立离线版式。
- GIF 以原始动画数据内嵌，不会转成静态首帧；播放器控制文字不会进入正文。
- 视频使用独立媒体管线：直接视频地址直接保存，B 站分离音视频由 yt-dlp + FFmpeg 合成为 360p MP4 后内嵌；单个视频上限 150 MB。
- 每篇收藏只生成一个 `.hermes` 文件，不产生旁置图片目录。
- 自动扫描 Obsidian 仓库文件夹，支持手动选择或智能分类。
- “我的收藏备注”始终作为独立区域保留。
- 快速整理仅分析文字并与图片下载并行；深度整理额外分析最多 8 张图片。
- 不配置模型或模型调用失败时，离线正文仍会保存。
- 本地服务只监听 `127.0.0.1:8765`。

## 项目结构

```text
extension/                 Edge/Chrome 扩展
local-server/              本地 FastAPI 收藏服务
obsidian-plugin/           Obsidian .hermes 页面查看器
tests/                     自动化测试
test-pages/                本地测试页面
docs/                      离线安装说明
```

## Windows 安装

要求 Python 3.11 或更高版本。

1. 双击 `安装依赖.bat`。
2. 打开 `local-server\.env`。
3. 将 `OBSIDIAN_VAULT_PATH` 设置为你的 Obsidian 仓库根目录，例如 `D:\Obsidian\MyVault`。
4. 生成收藏器令牌：在 PowerShell 运行 `[guid]::NewGuid().ToString('N')`，把结果填入 `LOCAL_COLLECTOR_TOKEN`。
5. 双击 `启动网页收藏器.bat`。状态页显示本地服务正常、仓库可写即表示启动成功。

不要提交或分享 `local-server\.env`。

## 安装浏览器扩展

1. Edge 打开 `edge://extensions/`；Chrome 打开 `chrome://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”，选择本项目的 `extension` 文件夹。
4. 打开扩展的“连接设置”，填写 `http://127.0.0.1:8765` 和 `.env` 中相同的收藏器令牌。

扩展需要读取当前网页，因此声明了网页访问权限；网页内容只会发送给本机收藏服务以及你主动配置的智能整理接口。

## 安装 Obsidian 查看器

1. 将 `obsidian-plugin\hermes-page-viewer` 复制到仓库的 `.obsidian\plugins\hermes-page-viewer`。
2. 重启 Obsidian。
3. 在“第三方插件”中启用 **Hermes Page Viewer**。

查看器使用受限 iframe 展示离线页面，不执行收藏网页中的脚本，也不加载远程图片。

## 智能整理接口

打开扩展的“连接设置”，只填写一套通用配置：

- **Base URL**：例如本地 LM Studio 的 `http://127.0.0.1:1234/v1`。
- **模型名称**：接口返回的模型 ID。
- **API Key**：本地服务通常留空，远程服务填写对应密钥。

点击“保存并测试智能整理接口”。密钥只写入本机 `local-server\.env`，不会回传到扩展。若服务不支持 JSON Schema 或 `reasoning_effort`，收藏器会自动降级到基础 Chat Completions 请求。

## 三种保存模式

- **快速整理（文字分析）**：文字整理与图片下载并行，速度优先。
- **深度整理（含图片分析）**：在完整离线保存后向视觉模型发送最多 8 张压缩分析图。
- **仅保存原文**：完全不调用模型。

无论选择哪种模式，图片保存都不依赖智能整理接口。无法下载的防盗链、登录态、Canvas 或视频帧资源会显示离线失败提示；新版扩展会为每张图片记录唯一 DOM 位置，服务端按位置 ID 原位回填；只有旧扩展没有位置 ID 时才使用文字上下文兜底。

## 开发与测试

```powershell
python -m venv local-server\.venv
local-server\.venv\Scripts\python -m pip install -r local-server\requirements-dev.txt
local-server\.venv\Scripts\python -m pytest -q
node --check extension\extractor.js
node --check extension\capture-selection.js
node --check extension\popup.js
node tests\test_capture_selection.js
node --check obsidian-plugin\hermes-page-viewer\main.js
```

GitHub Actions 会在 Windows 和 Linux 上运行同一组核心检查。

## 安全与隐私

请阅读 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。真实 `.env`、日志、虚拟环境和测试输出均已被 `.gitignore` 排除。

## 已知限制

- 登录后图片、强防盗链图片、Canvas/WebGL 内容可能无法完整离线化。
- 动态虚拟列表网站需要专门适配；当前已对飞书顶层文档、跨域 ISV 正文和虚拟区块做分 frame 收集。
- `.hermes` 是自包含 HTML 页面，不是普通 Markdown，需安装随附的 Obsidian 查看器。

## License

[MIT](LICENSE)
