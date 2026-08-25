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
const LIBRARY_PATH = "PageNest Library.md";
const LIBRARY_MARKER = "<!-- pagenest-generated-library:v1 -->";
const RESPONSIVE_MEDIA_STYLE = `<style data-pagenest-viewer-media>
[data-hermes-kind="xhs-video"] { width: 100%; max-width: 100%; overflow: hidden; }
[data-hermes-kind="xhs-video"] video { display: block; width: 100%; max-width: 100%; height: auto; object-fit: contain; margin: 0 auto; }
</style>`;
const NOTEBOOK_LIGHTBOX_STYLE = `<style data-pagenest-viewer-lightbox>
[data-pagenest-notebook-entry] > img { cursor: zoom-in; }
[data-pagenest-notebook-entry] > img:focus-visible { outline: 3px solid #8fa8ff; outline-offset: 4px; }
.pagenest-lightbox-overlay { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 3vh 4vw; overflow: auto; background: rgba(0, 0, 0, .66); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.pagenest-lightbox-panel { position: relative; display: grid; justify-items: center; gap: 12px; width: min(92vw, 1600px); max-height: 94vh; min-width: 0; color: #f7f8fb; }
.pagenest-lightbox-image { display: block; max-width: 90vw; max-height: 72vh; width: auto; height: auto; object-fit: contain; border-radius: 10px; background: #101216; box-shadow: 0 20px 60px rgba(0, 0, 0, .42); }
.pagenest-lightbox-title { max-width: min(86vw, 1200px); margin: 0; padding: 0 46px; color: #fff; font: 650 20px/1.4 Inter, "Segoe UI", system-ui, sans-serif; text-align: center; }
.pagenest-lightbox-timestamp { color: rgba(255, 255, 255, .72); font: 600 12px/1.3 Inter, "Segoe UI", system-ui, sans-serif; letter-spacing: .04em; }
.pagenest-lightbox-summary { max-width: min(86vw, 1000px); max-height: 18vh; margin: 0; padding: 10px 14px; overflow: auto; border-radius: 10px; background: rgba(18, 21, 29, .72); color: #f1f3f8; font: 400 15px/1.65 Inter, "Segoe UI", system-ui, sans-serif; white-space: pre-wrap; }
.pagenest-lightbox-close { position: absolute; top: -4px; right: 0; display: grid; place-items: center; width: 38px; height: 38px; padding: 0; border: 1px solid rgba(255, 255, 255, .34); border-radius: 999px; background: rgba(13, 15, 20, .72); color: #fff; font: 26px/1 Arial, sans-serif; cursor: pointer; }
.pagenest-lightbox-close:hover, .pagenest-lightbox-close:focus-visible { background: rgba(39, 45, 58, .96); outline: 2px solid #fff; outline-offset: 2px; }
@media (max-height: 680px) { .pagenest-lightbox-image { max-height: 64vh; } .pagenest-lightbox-summary { max-height: 15vh; } }
</style>`;

async function readIndexDocuments(app) {
  const payload = JSON.parse(await app.vault.adapter.read(INDEX_PATH));
  return payload?.schema_version === 1 && payload.documents ? payload.documents : {};
}

function markdownLibrary(documents) {
  const sections = Object.entries(documents || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, document]) => {
      const title = String(document.title || path.replace(/\.(?:pagenest|hermes)$/iu, ""))
        .replace(/\s+/gu, " ")
        .trim();
      const source = String(document.source || "").trim();
      const text = String(document.text || "").trim();
      const metadata = [`- PageNest 原文件：\`${path}\``];
      if (source) metadata.push(`- 来源：${source}`);
      return [`## ${title || "未命名收藏"}`, "", ...metadata, "", text].join("\n").trimEnd();
    });
  return [
    LIBRARY_MARKER,
    "---",
    "pagenest_generated: true",
    "pagenest_schema: 1",
    "---",
    "",
    "# PageNest Library",
    "",
    "> 由 PageNest 生成，供全文搜索、Dataview 和 AI 工具读取。请勿在此文件中保存手工笔记。",
    "",
    ...sections,
    "",
  ].join("\n");
}

async function writeMarkdownLibrary(app, documents) {
  const adapter = app.vault.adapter;
  if (await adapter.exists(LIBRARY_PATH)) {
    const existing = await adapter.read(LIBRARY_PATH);
    if (!existing.startsWith(LIBRARY_MARKER)) {
      throw new Error(`不会覆盖已有的 ${LIBRARY_PATH}，请先为该文件改名`);
    }
  }
  await adapter.write(LIBRARY_PATH, markdownLibrary(documents));
  return Object.keys(documents || {}).length;
}

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
      this.documents = await readIndexDocuments(this.app);
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

const CSP_NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/iu;
const RUNTIME_NONCE = /^[A-Za-z0-9+/_-]+={0,2}$/u;

function htmlAttribute(tag, name) {
  const expression = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu");
  const match = expression.exec(tag);
  if (!match) return null;
  return {end: match.index + match[0].length, start: match.index, value: match[1] ?? match[2] ?? match[3] ?? ""};
}

function contentSecurityPolicy(page) {
  const policies = [];
  for (const match of page.matchAll(/<meta\b[^>]*>/giu)) {
    const httpEquiv = htmlAttribute(match[0], "http-equiv");
    if (httpEquiv?.value.toLowerCase() !== "content-security-policy") continue;
    const content = htmlAttribute(match[0], "content");
    if (!content) return {valid: false};
    policies.push({
      content: content.value,
      contentEnd: content.end,
      contentStart: content.start,
      end: match.index + match[0].length,
      start: match.index,
      tag: match[0],
    });
  }
  if (policies.length > 1) return {valid: false};
  return policies.length ? {valid: true, policy: policies[0]} : {valid: true, policy: null};
}

function cspDirectives(content) {
  const segments = content.split(";");
  const directives = [];
  segments.forEach((segment, index) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const [name, ...tokens] = trimmed.split(/\s+/u);
    if (!directives.some(directive => directive.name === name.toLowerCase())) {
      directives.push({index, name: name.toLowerCase(), originalName: name, tokens});
    }
  });
  return {directives, segments};
}

function replaceCspContent(page, policy, content) {
  const tag = `${policy.tag.slice(0, policy.contentStart)}content="${content}"${policy.tag.slice(policy.contentEnd)}`;
  return `${page.slice(0, policy.start)}${tag}${page.slice(policy.end)}`;
}

function viewerRuntimePolicy(page, generatedNonce) {
  if (!RUNTIME_NONCE.test(generatedNonce)) return null;
  const parsedPolicy = contentSecurityPolicy(page);
  if (!parsedPolicy.valid) return null;
  if (!parsedPolicy.policy) return {nonce: generatedNonce, page};

  const parsed = cspDirectives(parsedPolicy.policy.content);
  const effective = parsed.directives.find(directive => directive.name === "script-src-elem")
    || parsed.directives.find(directive => directive.name === "script-src")
    || parsed.directives.find(directive => directive.name === "default-src");
  if (!effective) return {nonce: generatedNonce, page};

  for (const token of effective.tokens) {
    const nonce = token.match(CSP_NONCE_SOURCE)?.[1];
    if (nonce) return {nonce, page};
  }
  const replaceableNone = ["script-src", "script-src-elem"].includes(effective.name)
    && effective.tokens.length === 1
    && effective.tokens[0].toLowerCase() === "'none'";
  if (!replaceableNone) return null;

  const original = parsed.segments[effective.index];
  const leading = original.match(/^\s*/u)?.[0] || "";
  const trailing = original.match(/\s*$/u)?.[0] || "";
  parsed.segments[effective.index] = `${leading}${effective.originalName} 'nonce-${generatedNonce}'${trailing}`;
  const nextContent = parsed.segments.join(";");
  return {nonce: generatedNonce, page: replaceCspContent(page, parsedPolicy.policy, nextContent)};
}

function copyBridgeScript(channel, nonce = channel) {
  return `<script nonce="${nonce}" data-hermes-copy-bridge>
function pagenestNormalizeLegacyWeChatHeadings() {
  if (typeof document.querySelector !== 'function') return;
  var sourceMeta = document.querySelector('meta[name="hermes-source"]');
  var content = document.querySelector('[data-pagenest-role="content"]');
  if (!sourceMeta || !content || document.querySelector('[data-pagenest-notebook-entry]')) return;

  var sourceHost = '';
  try {
    sourceHost = new URL(String(sourceMeta.getAttribute('content') || '')).hostname.toLowerCase();
  } catch (_) {
    return;
  }
  if (sourceHost !== 'mp.weixin.qq.com') return;

  var headingSelector = 'h1,h2,h3,h4,h5,h6';
  var headings = Array.prototype.slice.call(content.querySelectorAll(headingSelector));
  var nestedHeadings = [];
  headings.forEach(function (heading) {
    for (var ancestor = heading.parentElement; ancestor && ancestor !== content; ancestor = ancestor.parentElement) {
      if (!/^H[1-6]$/.test(ancestor.tagName)) continue;
      if (nestedHeadings.indexOf(heading) < 0) nestedHeadings.push(heading);
      if (nestedHeadings.indexOf(ancestor) < 0) nestedHeadings.push(ancestor);
    }
  });

  for (var index = headings.length - 1; index >= 0; index -= 1) {
    var heading = headings[index];
    if (nestedHeadings.indexOf(heading) < 0) continue;
    var replacement = document.createElement('div');
    Array.prototype.forEach.call(heading.attributes, function (attribute) {
      replacement.setAttribute(attribute.name, attribute.value);
    });
    Array.prototype.slice.call(heading.childNodes).forEach(function (child) {
      replacement.appendChild(child);
    });
    heading.replaceWith(replacement);
  }
}

pagenestNormalizeLegacyWeChatHeadings();
document.querySelectorAll('[data-hermes-kind="xhs-comments"] .comment-meta').forEach(function (meta) {
  meta.textContent = meta.textContent.replace(/(?:^|\\s·\\s)(?:\\d+\\s*)?赞(?:\\s+赞)?\\s*$/u, '').trim();
  if (!meta.textContent) meta.remove();
});
window.hermesCopyText = function (text) {
  window.parent.postMessage({type: "${COPY_MESSAGE}", channel: "${channel}", text: text}, "*");
};

function pagenestLightboxText(node) {
  return node ? String(node.textContent || '').trim() : '';
}

function openPageNestLightbox(entry, trigger) {
  var title = pagenestLightboxText(entry.querySelector('h3'));
  var summary = pagenestLightboxText(entry.querySelector('p'));
  var timestamp = pagenestLightboxText(entry.querySelector('time'));
  var scrollX = window.scrollX || 0;
  var scrollY = window.scrollY || 0;
  var htmlOverflow = document.documentElement.style.overflow;
  var bodyOverflow = document.body.style.overflow;
  var overlay = document.createElement('div');
  var panel = document.createElement('div');
  var close = document.createElement('button');
  var image = document.createElement('img');

  overlay.className = 'pagenest-lightbox-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title || '视频截图预览');
  panel.className = 'pagenest-lightbox-panel';
  close.className = 'pagenest-lightbox-close';
  close.type = 'button';
  close.setAttribute('aria-label', '关闭截图预览');
  close.textContent = '×';
  image.className = 'pagenest-lightbox-image';
  image.src = trigger.src;
  image.alt = trigger.getAttribute('alt') || title || '视频截图';

  panel.appendChild(close);
  if (title) {
    var titleNode = document.createElement('h2');
    titleNode.className = 'pagenest-lightbox-title';
    titleNode.textContent = title;
    panel.appendChild(titleNode);
  }
  if (timestamp) {
    var timeNode = document.createElement('time');
    timeNode.className = 'pagenest-lightbox-timestamp';
    timeNode.textContent = timestamp;
    panel.appendChild(timeNode);
  }
  panel.appendChild(image);
  if (summary) {
    var summaryNode = document.createElement('p');
    summaryNode.className = 'pagenest-lightbox-summary';
    summaryNode.textContent = summary;
    panel.appendChild(summaryNode);
  }
  overlay.appendChild(panel);

  function closeLightbox() {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    document.documentElement.style.overflow = htmlOverflow;
    document.body.style.overflow = bodyOverflow;
    try { window.scrollTo(scrollX, scrollY); } catch (_) {}
    try { trigger.focus({preventScroll: true}); } catch (_) { trigger.focus(); }
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') closeLightbox();
  }

  close.addEventListener('click', closeLightbox);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeLightbox();
  });
  document.addEventListener('keydown', onKeyDown);
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  close.focus();
}

document.querySelectorAll('[data-pagenest-notebook-entry]').forEach(function (entry) {
  var screenshot = entry.querySelector('img');
  if (!screenshot) return;
  screenshot.tabIndex = 0;
  screenshot.setAttribute('role', 'button');
  screenshot.setAttribute('aria-label', '放大视频截图');
  screenshot.addEventListener('click', function () { openPageNestLightbox(entry, screenshot); });
  screenshot.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPageNestLightbox(entry, screenshot);
    }
  });
});
</script>`;
}

function withCopyBridge(page, channel) {
  const runtime = viewerRuntimePolicy(page, channel);
  const runtimePage = runtime?.page || page;
  const runtimeScript = runtime ? copyBridgeScript(channel, runtime.nonce) : "";
  const bridge = `${RESPONSIVE_MEDIA_STYLE}${NOTEBOOK_LIGHTBOX_STYLE}${runtimeScript}`;
  const bodyEnd = runtimePage.toLowerCase().lastIndexOf("</body>");
  return bodyEnd < 0
    ? `${runtimePage}${bridge}`
    : `${runtimePage.slice(0, bodyEnd)}${bridge}${runtimePage.slice(bodyEnd)}`;
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
    this.addCommand({
      id: "export-markdown-library",
      name: "生成 AI 可读资料库",
      callback: async () => {
        try {
          const documents = await readIndexDocuments(this.app);
          const count = await writeMarkdownLibrary(this.app, documents);
          new Notice(`已生成 ${LIBRARY_PATH}，包含 ${count} 篇收藏。`);
        } catch (error) {
          new Notice(`PageNest：${error.message || error}`);
        }
      },
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
module.exports.markdownLibrary = markdownLibrary;
module.exports.writeMarkdownLibrary = writeMarkdownLibrary;
module.exports.copyBridgeScript = copyBridgeScript;
module.exports.withCopyBridge = withCopyBridge;
