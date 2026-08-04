const { Plugin, TextFileView } = require("obsidian");
const { randomBytes } = require("node:crypto");

const VIEW_TYPE = "pagenest-page-view";
const COPY_MESSAGE = "hermes-copy";
const COPY_CHANNEL_BYTES = 32;
const MAX_COPY_LENGTH = 5 * 1024 * 1024;
const PAGE_EXTENSION = "pagenest";
const LEGACY_EXTENSION = "hermes";

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

module.exports = class HermesPageViewerPlugin extends Plugin {
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
