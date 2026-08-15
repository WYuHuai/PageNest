# PageNest v1.9.0

PageNest 1.9.0 keeps the self-contained web-style Viewer while making saved
pages searchable and usable by local automation and AI tools.

## Highlights / 主要更新

- **Obsidian full-text search / Obsidian 全文搜索** — Search titles, body text,
  code, loaded comments, and collection notes, then open the matching
  `.pagenest` directly.
- **AI-readable text / AI 可读文本** — Clean extraction excludes HTML, scripts,
  styles, and embedded base64 media while retaining article text, code,
  comments, notes, and source metadata.
- **One optional Markdown library / 单个可选 Markdown 资料库** — Generate
  `PageNest Library.md` from the Obsidian command palette for ripgrep,
  Dataview, and ordinary AI plugins. PageNest does not create a Markdown file
  beside every capture and does not overwrite an unrelated user file.
- **Incremental local index / 增量本地索引** — The local service updates a
  compact text index after startup, saves, and Vault changes. No database or
  cloud indexing service is introduced.
- **Legacy compatibility / 旧文件兼容** — Existing `.pagenest` and `.hermes`
  files remain readable; the file-format version stays at 1.

## Upgrade / 升级

Run `PageNest-Setup-1.9.0.exe` and select the current Obsidian Vault. The
installer keeps the configured Vault, local connection, and optional AI
settings. Restart Obsidian and confirm PageNest Viewer 1.4.0 is enabled.

运行 `PageNest-Setup-1.9.0.exe`，选择当前 Obsidian 知识库。安装器会保留已有知识库、
本地连接和可选 AI 设置。重启 Obsidian，并确认 PageNest Viewer 1.4.0 已启用。

The Windows installer still bundles the Python runtime. Users do not need to
install Python, Node.js, a database, or a task queue.
