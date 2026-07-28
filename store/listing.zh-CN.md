# Chrome Web Store / Edge Add-ons 商店文案（简体中文）

## 基本信息

- 名称：PageNest Web Collector
- 类别：生产力工具
- 语言：简体中文
- 简短说明：将当前网页的正文、图片和链接保存为单个 `.pagenest` 离线页面，并在 Obsidian 中安全查看。

## 详细说明

PageNest 是一套本地优先的网页收藏工具。点击扩展后，它会识别当前网页正文、
图片、代码块、链接和支持的媒体信息，再交给本机 PageNest 服务生成一个
自包含的 `.pagenest` 文件。PageNest Viewer 可直接在 Obsidian 中打开该文件，
不需要额外生成图片目录或大量 Markdown 附件。

主要能力：

- 单文件离线收藏，已成功嵌入的内容断网后仍可阅读；
- 保留正文结构、图片原位、GIF、代码块和外部仓库链接；
- 支持普通文章及飞书、微信、CSDN、B站的专用采集逻辑；
- 可选择收藏文件夹并添加个人备注；
- 可选连接用户自己配置的 OpenAI Chat Completions 兼容接口；
- 不包含遥测、广告或分析代码。

使用要求：

1. Windows 10 或 Windows 11；
2. 安装 PageNest Windows 本地服务；
3. 在 Obsidian 中启用 PageNest Viewer；
4. 用户只应收藏自己有权保存的内容。

PageNest 只在用户点击扩展后处理当前页面。默认情况下，内容从浏览器发送到
`127.0.0.1` 上带随机令牌保护的本地服务，并写入用户选择的 Obsidian 知识库。
只有用户主动选择 AI 整理模式时，正文或压缩图片才会发送到用户自己配置的模型
接口。

## 支持与隐私链接

- 支持：`https://github.com/<GITHUB_OWNER>/PageNest/issues`
- 隐私政策：`https://github.com/<GITHUB_OWNER>/PageNest/blob/main/PRIVACY.md`
- 源代码：`https://github.com/<GITHUB_OWNER>/PageNest`