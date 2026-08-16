# PageNest v1.9.1

PageNest 1.9.1 is a focused Windows installer reliability patch. It keeps all
v1.9.0 search, AI-readable library, capture, and Viewer capabilities unchanged.

## Fixed / 修复

- **Installer completion / 安装完成步骤** — The installer now asks the Windows
  Shell to open the installed browser-extension directory. It no longer tries
  to launch the nonexistent `C:\\Windows\\System32\\explorer.exe` path.
- **Regression protection / 回归保护** — Release tests now reject the invalid
  Explorer path and require the Shell-based directory action.

安装主体原本可以完成，但 v1.9.0 在安装结束时打开扩展目录可能弹出“系统找不到指定的
文件”。v1.9.1 修复了这一引导步骤；搜索、AI 可读资料库、网页模式 Viewer 和旧文件
兼容能力均保持不变。

## Install or upgrade / 安装或升级

Download and run `PageNest-Setup-1.9.1.exe`, then select the existing Obsidian
Vault. Existing PageNest configuration and saved collections are preserved.

下载并运行 `PageNest-Setup-1.9.1.exe`，选择现有 Obsidian 知识库即可。已有配置和收藏
不会被移动或删除。

The installer is unsigned, so Windows SmartScreen may display an unknown
publisher warning. Verify the published SHA-256 checksum before installation.

安装器暂未进行 Authenticode 签名，Windows SmartScreen 可能提示未知发布者。安装前请
核对 Release 页面提供的 SHA-256。
