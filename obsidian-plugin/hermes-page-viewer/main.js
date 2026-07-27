const { Plugin, TextFileView } = require("obsidian");

const VIEW_TYPE = "hermes-page-view";
const COPY_MESSAGE = "hermes-copy";
const MAX_COPY_LENGTH = 5 * 1024 * 1024;

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
    return this.file?.basename || "Hermes 离线页面";
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
        sandbox: "allow-popups allow-scripts allow-same-origin",
        allow: "clipboard-write",
        referrerpolicy: "no-referrer",
        title: this.getDisplayText(),
      },
    });

    this.copyHandler = async (event) => {
      if (event.source !== frame.contentWindow || event.data?.type !== COPY_MESSAGE) return;
      const text = event.data.text;
      if (typeof text !== "string" || text.length > MAX_COPY_LENGTH) return;
      await this.copyText(text);
    };
    window.addEventListener("message", this.copyHandler);

    frame.addEventListener("load", () => {
      const frameDocument = frame.contentDocument;
      if (!frameDocument) return;
      frameDocument.addEventListener("click", async (event) => {
        const button = event.target?.closest?.("[data-hermes-copy]");
        if (!button) return;
        const code = button.closest('[data-hermes-kind="code-shell"]')?.querySelector("pre");
        if (!code) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const lines = code.querySelectorAll('[data-hermes-kind="code-line"]');
        const text = lines.length
          ? Array.from(lines, (line) => line.innerText || line.textContent || "").join("\n")
          : (code.innerText || code.textContent || "");
        if (text.length > MAX_COPY_LENGTH) return;
        await this.copyText(text);
        const original = button.textContent;
        button.textContent = "已复制";
        setTimeout(() => { button.textContent = original; }, 1200);
      }, true);
    });

    frame.srcdoc = this.data;
    refresh.addEventListener("click", () => {
      frame.srcdoc = this.data;
    });
  }
}

module.exports = class HermesPageViewerPlugin extends Plugin {
  hideFileTypeBadges() {
    document.querySelectorAll(".nav-file-tag").forEach((badge) => {
      if (badge.textContent?.trim().toLowerCase() === "hermes") {
        badge.style.setProperty("display", "none", "important");
        badge.setAttribute("aria-hidden", "true");
      }
    });
  }

  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new HermesPageView(leaf));
    this.registerExtensions(["hermes"], VIEW_TYPE);
    this.app.workspace.onLayoutReady(() => {
      this.hideFileTypeBadges();
      this.badgeObserver = new MutationObserver(() => this.hideFileTypeBadges());
      this.badgeObserver.observe(document.body, { childList: true, subtree: true });
      this.register(() => this.badgeObserver?.disconnect());
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
};
