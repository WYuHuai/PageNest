const { Modal, Notice, Plugin, TextFileView } = require("obsidian");
const { randomBytes } = require("node:crypto");

const VIEW_TYPE = "pagenest-page-view";
const COPY_MESSAGE = "hermes-copy";
const COPY_CHANNEL_BYTES = 32;
const MAX_COPY_LENGTH = 5 * 1024 * 1024;
const PAGE_EXTENSION = "pagenest";
const LEGACY_EXTENSION = "hermes";
const INDEX_PATH = ".pagenest/search-index.json";
const MAX_SEARCH_RESULTS = 50;

function normalizedTerms(query) {
  return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
}

function resultSnippet(text, terms, radius = 70) {
  const compact = String(text || "").replace(/\s+/gu, " ").trim();
  const folded = compact.toLocaleLowerCase();
  const positions = terms.map((term) => folded.indexOf(term)).filter((value) => value >= 0);
  const position = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, position - radius);
  const end = Math.min(compact.length, position + Math.max(...terms.map((term) => term.length)) + radius);
  return `${start ? "…" : ""}${compact.slice(start, end).trim()}${end < compact.length ? "…" : ""}`;
}

function searchIndexDocuments(documents, query, limit = MAX_SEARCH_RESULTS) {
  const terms = normalizedTerms(query);
  if (!terms.length) return [];
  return Object.entries(documents || {})
    .map(([path, document]) => {
      const title = String(document.title || path.replace(/\.(?:pagenest|hermes)$/iu, ""));
      const text = String(document.text || "");
      const foldedText = text.toLocaleLowerCase();
      if (!terms.every((term) => foldedText.includes(term))) return null;
      const foldedTitle = title.toLocaleLowerCase();
      const score = terms.reduce(
        (total, term) => total + foldedText.split(term).length - 1 + (foldedTitle.includes(term) ? 10 : 0),
        0,
      );
      return {
        path,
        title,
        snippet: resultSnippet(text, terms),
        score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS)));
}

class PageNestSearchModal extends Modal {
  constructor(app) {
    super(app);
    this.documents = {};
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pagenest-search-modal");
    contentEl.createEl("h2", { text: "搜索 PageNest 收藏" });
    contentEl.createEl("p", {
      cls: "pagenest-search-hint",
      text: "搜索正文、代码、已加载评论和收藏备注",
    });
    this.inputEl = contentEl.createEl("input", {
      cls: "pagenest-search-input",
      attr: { type: "search", placeholder: "输入关键词", "aria-label": "搜索 PageNest 收藏" },
    });
    this.resultsEl = contentEl.createDiv({ cls: "pagenest-search-results" });
    this.inputEl.addEventListener("input", () => this.renderResults());
    await this.loadIndex();
    this.inputEl.focus();
  }

  async loadIndex() {
    try {
      const payload = JSON.parse(await this.app.vault.adapter.read(INDEX_PATH));
      this.documents = payload?.schema_version === 1 && payload.documents
        ? payload.documents
        : {};
      this.renderResults();
    } catch (error) {
      this.documents = {};
      this.renderMessage("搜索索引尚未生成。请确认 PageNest 本地服务正在运行。", "warning");
      console.warn("PageNest Viewer: could not load search index.", error);
    }
  }

  renderMessage(text, kind = "muted") {
    this.resultsEl.empty();
    this.resultsEl.createDiv({ cls: `pagenest-search-message is-${kind}`, text });
  }

  renderResults() {
    const query = this.inputEl.value.trim();
    if (!query) {
      this.renderMessage(`已索引 ${Object.keys(this.documents).length} 篇收藏`);
      return;
    }
    const results = searchIndexDocuments(this.documents, query);
    if (!results.length) {
      this.renderMessage("没有找到匹配的 PageNest 收藏");
      return;
    }
    this.resultsEl.empty();
    for (const result of results) {
      const item = this.resultsEl.createEl("button", { cls: "pagenest-search-result" });
      item.createDiv({ cls: "pagenest-search-result-title", text: result.title });
      item.createDiv({ cls: "pagenest-search-result-path", text: result.path });
      item.createDiv({ cls: "pagenest-search-result-snippet", text: result.snippet });
      item.addEventListener("click", () => this.openResult(result.path));
    }
  }

  async openResult(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice("收藏文件已移动或删除，请等待 PageNest 更新索引。");
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

function copyBridgeScript(channel) {
  return `<script nonce="hermes-offline" data-hermes-copy-bridge>
window.hermesCopyText = function (text) {
  window.parent.postMessage({type: "${COPY_MESSAGE}", channel: "${channel}", text: text}, "*");
};
</script>`;
}

function withCopyBridge(page, channel) {
  const bridge = copyBridgeScript(channel);
  const bodyEnd = page.toLowerCase().lastIndexOf("</body>");
  return bodyEnd < 0
    ? `${page}${bridge}`
    : `${page.slice(0, bodyEnd)}${bridge}${page.slice(bodyEnd)}`;
}

class HermesPageView extends TextFileView {
  constructor(leaf) {
    super(leaf);
    this.data = "";
    this.copyHandler = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file?.basename || "PageNest 离线页面";
  }

  getIcon() {
    return "book-open-text";
  }

  async setViewData(data) {
    this.data = data;
    this.renderPage();
  }

  getViewData() {
    return this.data;
  }

  removeCopyHandler() {
    if (!this.copyHandler) return;
    window.removeEventListener("message", this.copyHandler);
    this.copyHandler = null;
  }

  clear() {
    this.removeCopyHandler();
    this.data = "";
    this.contentEl.empty();
  }

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      require("electron").clipboard.writeText(text);
    }
  }

  renderPage() {
    this.removeCopyHandler();
    this.contentEl.empty();
    this.contentEl.addClass("hermes-page-viewer");
    const toolbar = this.contentEl.createDiv({ cls: "hermes-page-toolbar" });
    toolbar.createSpan({ text: "离线单文件 · 图片已内嵌" });
    const refresh = toolbar.createEl("button", { text: "刷新页面" });
    const frame = this.contentEl.createEl("iframe", {
      cls: "hermes-page-frame",
      attr: {
        sandbox: "allow-popups allow-scripts",
        referrerpolicy: "no-referrer",
        title: this.getDisplayText(),
      },
    });

    let copyChannel = "";
    this.copyHandler = async (event) => {
      if (
        event.source !== frame.contentWindow
        || event.data?.type !== COPY_MESSAGE
        || event.data.channel !== copyChannel
      ) return;
      const text = event.data.text;
      if (typeof text !== "string" || text.length > MAX_COPY_LENGTH) return;
      await this.copyText(text);
    };
    window.addEventListener("message", this.copyHandler);

    const loadFrame = () => {
      copyChannel = randomBytes(COPY_CHANNEL_BYTES).toString("hex");
      frame.srcdoc = withCopyBridge(this.data, copyChannel);
    };
    loadFrame();
    refresh.addEventListener("click", loadFrame);
  }
}

class HermesPageViewerPlugin extends Plugin {
  hideFileTypeBadges() {
    document.querySelectorAll(".nav-file-tag").forEach((badge) => {
      if (["pagenest", "hermes"].includes(badge.textContent?.trim().toLowerCase())) {
        badge.style.setProperty("display", "none", "important");
        badge.setAttribute("aria-hidden", "true");
      }
    });
  }

  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new HermesPageView(leaf));
    this.registerExtensions([PAGE_EXTENSION], VIEW_TYPE);
    try {
      this.registerExtensions([LEGACY_EXTENSION], VIEW_TYPE);
    } catch (error) {
      console.warn("PageNest Viewer: legacy .hermes files are handled by another plugin.", error);
    }
    this.app.workspace.onLayoutReady(() => {
      this.hideFileTypeBadges();
      this.badgeObserver = new MutationObserver(() => this.hideFileTypeBadges());
      this.badgeObserver.observe(document.body, { childList: true, subtree: true });
      this.register(() => this.badgeObserver?.disconnect());
    });
    this.addCommand({
      id: "search-pages",
      name: "搜索 PageNest 收藏",
      callback: () => new PageNestSearchModal(this.app).open(),
    });
    this.addRibbonIcon("search", "搜索 PageNest 收藏", () => {
      new PageNestSearchModal(this.app).open();
    });
    this.addCommand({
      id: "reload-active-page",
      name: "刷新当前离线页面",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(HermesPageView);
        if (!view) return false;
        if (!checking) view.renderPage();
        return true;
      },
    });
  }
}

module.exports = HermesPageViewerPlugin;
module.exports.PageNestSearchModal = PageNestSearchModal;
module.exports.searchIndexDocuments = searchIndexDocuments;
