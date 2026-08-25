const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const vm = require("node:vm");
const {bridgeWithCsp} = require("./viewer_csp_harness");

let viewFactory;
const registeredExtensions = [];
let legacyExtensionConflict = false;
let frame;
let copiedText = "";
let refreshHandler;
let ribbonHandler;
const commands = [];
const listeners = new Map();

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {clipboard: {writeText: async (text) => { copiedText = text; }}},
});
globalThis.window = {
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  },
};
globalThis.document = {querySelectorAll: () => [], body: {}};
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};

class TextFileView {
  constructor(leaf) {
    this.contentEl = leaf.contentEl;
    this.file = {basename: "测试页面"};
  }
}

class Modal {}
class Notice {}

class Plugin {
  constructor() {
    this.app = {
      workspace: {
        onLayoutReady() {},
        getActiveViewOfType() { return null; },
      },
    };
  }

  registerView(_type, factory) {
    viewFactory = factory;
  }

  registerExtensions(extensions) {
    registeredExtensions.push(extensions);
    if (legacyExtensionConflict && extensions.includes("hermes")) {
      throw new Error("extension already registered");
    }
  }
  register() {}
  addCommand(command) { commands.push(command); }
  addRibbonIcon(icon, title, callback) {
    assert.equal(icon, "search");
    assert.equal(title, "搜索 PageNest 收藏");
    ribbonHandler = callback;
  }
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return {Modal, Notice, Plugin, TextFileView};
  if (request === "electron") {
    return {clipboard: {writeText: (text) => { copiedText = text; }}};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const pluginPath = path.resolve(__dirname, "../obsidian-plugin/pagenest-viewer/main.js");
const HermesPageViewerPlugin = require(pluginPath);
Module._load = originalLoad;

const plugin = new HermesPageViewerPlugin();
plugin.onload();
assert.equal(typeof viewFactory, "function");
assert.deepEqual(registeredExtensions, [["pagenest"], ["hermes"]]);
assert.equal(typeof ribbonHandler, "function");
assert.ok(commands.some((command) => command.id === "search-pages"));
assert.ok(commands.some((command) => command.id === "export-markdown-library"));

const refresh = {
  addEventListener(type, listener) {
    assert.equal(type, "click");
    refreshHandler = listener;
  },
};
const toolbar = {
  createSpan() {},
  createEl(tag) {
    assert.equal(tag, "button");
    return refresh;
  },
};
const contentEl = {
  empty() {},
  addClass() {},
  createDiv() { return toolbar; },
  createEl(tag, options) {
    assert.equal(tag, "iframe");
    frame = {
      contentWindow: {},
      srcdoc: "",
      attributes: options.attr,
    };
    return frame;
  },
};

function channelFrom(page) {
  return page.match(/channel: "([a-f0-9]{64})"/)?.[1] || "";
}

(async () => {
  legacyExtensionConflict = true;
  const originalWarn = console.warn;
  let legacyWarning = "";
  console.warn = (message) => { legacyWarning = message; };
  try {
    await new HermesPageViewerPlugin().onload();
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(registeredExtensions.slice(-2), [["pagenest"], ["hermes"]]);
  assert.match(legacyWarning, /legacy \.hermes/);

  const view = viewFactory({contentEl});
  const legacyFixture = fs.readFileSync(path.resolve(__dirname, "fixtures/legacy-page.hermes"), "utf8");
  await view.setViewData(legacyFixture);

  assert.match(frame.srcdoc, /旧版文章标题/);
  assert.match(frame.srcdoc, /旧版正文仍然可以阅读和搜索/);
  assert.match(frame.srcdoc, /print\(&quot;legacy&quot;\)|print\("legacy"\)/);

  await view.setViewData("<!doctype html><body><pre>const answer = 42;</pre></body>");

  assert.equal(frame.attributes.sandbox, "allow-popups allow-scripts");
  assert.equal(frame.attributes.allow, undefined);
  assert.match(frame.srcdoc, /data-hermes-copy-bridge/);
  assert.match(frame.srcdoc, /data-pagenest-viewer-media/);
  assert.match(frame.srcdoc, /\[data-hermes-kind="xhs-video"\] video \{[^}]*width: 100%;[^}]*height: auto;/);
  assert.match(frame.srcdoc, /xhs-comments.*comment-meta/);
  assert.match(frame.srcdoc, /meta\.textContent\.replace/);
  assert.match(frame.srcdoc, /<pre>const answer = 42;<\/pre>/);
  const commentMeta = [
    {textContent: "河南 · 4天前 · 赞 赞", remove() { this.removed = true; }},
    {textContent: "上海 · 08-08 · 12 赞", remove() { this.removed = true; }},
  ];
  const viewerScript = frame.srcdoc.match(/<script[^>]*data-hermes-copy-bridge[^>]*>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(viewerScript, {
    document: {
      querySelectorAll: (selector) => selector.includes("xhs-comments") ? commentMeta : [],
    },
    window: {parent: {postMessage() {}}},
  });
  assert.deepEqual(commentMeta.map(meta => meta.textContent), ["河南 · 4天前", "上海 · 08-08"]);
  assert.ok(frame.srcdoc.indexOf("data-hermes-copy-bridge") < frame.srcdoc.indexOf("</body>"));
  const firstChannel = channelFrom(frame.srcdoc);
  assert.equal(firstChannel.length, 64);

  const handler = listeners.get("message");
  assert.equal(typeof handler, "function");
  await handler({
    source: frame.contentWindow,
    data: {type: "hermes-copy", channel: firstChannel, text: "const answer = 42;"},
  });
  assert.equal(copiedText, "const answer = 42;");

  await handler({
    source: frame.contentWindow,
    data: {type: "hermes-copy", channel: "wrong", text: "blocked"},
  });
  await handler({
    source: {},
    data: {type: "hermes-copy", channel: firstChannel, text: "blocked"},
  });
  await handler({
    source: frame.contentWindow,
    data: {type: "hermes-copy", channel: firstChannel, text: "x".repeat(5 * 1024 * 1024 + 1)},
  });
  assert.equal(copiedText, "const answer = 42;");

  refreshHandler();
  const secondChannel = channelFrom(frame.srcdoc);
  assert.equal(secondChannel.length, 64);
  assert.notEqual(secondChannel, firstChannel);
  await handler({
    source: frame.contentWindow,
    data: {type: "hermes-copy", channel: firstChannel, text: "stale"},
  });
  assert.equal(copiedText, "const answer = 42;");

  function fakeElement(tagName) {
    return {
      tagName,
      attributes: {},
      children: [],
      listeners: {},
      style: {},
      textContent: "",
      className: "",
      parentNode: null,
      removed: false,
      focused: false,
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] || ""; },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      remove() {
        this.removed = true;
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        }
      },
      focus() { this.focused = true; },
      querySelector() { return null; },
    };
  }

  function lightboxHarness({
    title = "<img src=x onerror=alert(1)>",
    summary = "安全摘要 <script>alert(1)</script>",
    csp = "default-src 'none'; img-src data:; script-src 'nonce-hermes-offline'; style-src 'unsafe-inline'",
  } = {}) {
    const body = fakeElement("body");
    body.style.overflow = "auto";
    const documentElement = fakeElement("html");
    documentElement.style.overflow = "scroll";
    const screenshot = fakeElement("img");
    screenshot.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    screenshot.attributes.alt = "截图说明";
    const titleNode = title ? {...fakeElement("h3"), textContent: title} : null;
    const summaryNode = summary ? {...fakeElement("p"), textContent: summary} : null;
    const timeNode = {...fakeElement("time"), textContent: "01:05"};
    const entry = fakeElement("article");
    entry.querySelector = (selector) => ({img: screenshot, h3: titleNode, p: summaryNode, time: timeNode})[selector] || null;
    const documentListeners = {};
    const document = {
      body,
      documentElement,
      createElement: fakeElement,
      querySelectorAll(selector) {
        if (selector.includes("xhs-comments")) return [];
        if (selector === "[data-pagenest-notebook-entry]") return [entry];
        return [];
      },
      addEventListener(type, listener) { documentListeners[type] = listener; },
      removeEventListener(type, listener) {
        if (documentListeners[type] === listener) delete documentListeners[type];
      },
    };
    const scrolls = [];
    const window = {
      parent: {postMessage() {}},
      scrollX: 11,
      scrollY: 22,
      scrollTo(x, y) { scrolls.push([x, y]); },
    };
    const injected = bridgeWithCsp(HermesPageViewerPlugin, csp);
    assert.equal(injected.allowed, true, "runtime must be authorized by the effective CSP");
    vm.runInNewContext(injected.script, {document, window});
    return {body, documentElement, documentListeners, entry, screenshot, scrolls, script: injected.script};
  }

  const lightbox = lightboxHarness();
  assert.equal(lightbox.screenshot.tabIndex, 0);
  assert.equal(lightbox.screenshot.attributes.role, "button");
  lightbox.screenshot.listeners.click();
  const overlay = lightbox.body.children.at(-1);
  assert.equal(overlay.className, "pagenest-lightbox-overlay", "LIGHTBOX-01");
  assert.equal(overlay.attributes.role, "dialog");
  assert.equal(overlay.attributes["aria-modal"], "true");
  const panel = overlay.children[0];
  const closeButton = panel.children.find((node) => node.className === "pagenest-lightbox-close");
  const lightboxTitle = panel.children.find((node) => node.className === "pagenest-lightbox-title");
  const lightboxTime = panel.children.find((node) => node.className === "pagenest-lightbox-timestamp");
  const lightboxImage = panel.children.find((node) => node.className === "pagenest-lightbox-image");
  const lightboxSummary = panel.children.find((node) => node.className === "pagenest-lightbox-summary");
  assert.equal(lightboxImage.src, lightbox.screenshot.src, "LIGHTBOX-02/B12");
  assert.equal(lightboxTitle.textContent, "<img src=x onerror=alert(1)>", "LIGHTBOX-03/13");
  assert.equal(lightboxSummary.textContent, "安全摘要 <script>alert(1)</script>", "LIGHTBOX-04/13");
  assert.equal(lightboxTime.textContent, "01:05");
  assert.equal(closeButton.attributes["aria-label"], "关闭截图预览");
  assert.equal(closeButton.focused, true);
  assert.equal(lightbox.documentElement.style.overflow, "hidden", "LIGHTBOX-11");
  assert.equal(lightbox.body.style.overflow, "hidden", "LIGHTBOX-11");
  overlay.listeners.click({target: lightboxImage});
  assert.equal(overlay.removed, false, "LIGHTBOX-09");
  overlay.listeners.click({target: overlay});
  assert.equal(overlay.removed, true, "LIGHTBOX-08");
  assert.equal(lightbox.documentElement.style.overflow, "scroll", "LIGHTBOX-11");
  assert.equal(lightbox.body.style.overflow, "auto", "LIGHTBOX-11");
  assert.deepEqual(lightbox.scrolls.at(-1), [11, 22], "LIGHTBOX-11");
  assert.equal(lightbox.screenshot.focused, true, "LIGHTBOX-12");

  lightbox.screenshot.focused = false;
  lightbox.screenshot.listeners.click();
  const escapeOverlay = lightbox.body.children.at(-1);
  lightbox.documentListeners.keydown({key: "Escape"});
  assert.equal(escapeOverlay.removed, true, "LIGHTBOX-07");

  lightbox.screenshot.listeners.click();
  const buttonOverlay = lightbox.body.children.at(-1);
  const button = buttonOverlay.children[0].children.find((node) => node.className === "pagenest-lightbox-close");
  button.listeners.click();
  assert.equal(buttonOverlay.removed, true, "LIGHTBOX-10");

  const missing = lightboxHarness({title: "", summary: ""});
  missing.screenshot.listeners.click();
  const missingPanel = missing.body.children.at(-1).children[0];
  assert.equal(missingPanel.children.some((node) => node.className === "pagenest-lightbox-title"), false, "LIGHTBOX-05");
  assert.equal(missingPanel.children.some((node) => node.className === "pagenest-lightbox-summary"), false, "LIGHTBOX-06");
  assert.equal(lightbox.script.includes("innerHTML"), false, "LIGHTBOX-13");
  assert.equal(view.getViewData(), "<!doctype html><body><pre>const answer = 42;</pre></body>", "LIGHTBOX-14");

  const existing = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; script-src 'nonce-existing'; img-src data:",
    "b".repeat(64),
  );
  assert.equal(existing.nonce, "existing", "CSP-01");
  assert.equal(existing.allowed, true, "CSP-01 executable contract");

  const historicalCsp = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; img-src data:; script-src 'nonce-hermes-offline'; style-src 'unsafe-inline'",
  );
  assert.equal(historicalCsp.nonce, "hermes-offline", "CSP-02");
  assert.equal(historicalCsp.allowed, true, "CSP-02 executable contract");

  const none = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; img-src data:; script-src 'none'; style-src 'unsafe-inline'",
    "b".repeat(64),
  );
  assert.equal(none.nonce, "b".repeat(64), "CSP-03");
  assert.equal(none.allowed, true, "CSP-03 executable contract");
  assert.match(none.csp, new RegExp(`script-src 'nonce-${"b".repeat(64)}'`));

  const defaultOnly = bridgeWithCsp(HermesPageViewerPlugin, "default-src 'none'; img-src data:");
  assert.equal(defaultOnly.script, "", "CSP-04 fail closed");
  assert.equal(defaultOnly.csp, "default-src 'none'; img-src data:", "CSP-04 policy preserved");

  const defaultNonce = bridgeWithCsp(HermesPageViewerPlugin, "default-src 'nonce-default-policy'; img-src data:");
  assert.equal(defaultNonce.nonce, "default-policy", "CSP-04 effective default nonce");
  assert.equal(defaultNonce.allowed, true, "CSP-04 effective default executable contract");

  const elementPolicy = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; script-src 'nonce-script'; script-src-elem 'nonce-element'",
  );
  assert.equal(elementPolicy.nonce, "element", "CSP-05");
  assert.equal(elementPolicy.allowed, true, "CSP-05 executable contract");

  const elementNone = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; script-src 'nonce-script'; script-src-elem 'none'",
    "d".repeat(64),
  );
  assert.equal(elementNone.nonce, "d".repeat(64), "CSP-05 effective none update");
  assert.equal(elementNone.allowed, true, "CSP-05 effective none executable contract");
  assert.match(elementNone.csp, /script-src 'nonce-script'; script-src-elem 'nonce-dd+/);

  const preserved = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; IMG-SRC data:; media-src blob:; ScRiPt-SrC    'none' ; style-src 'unsafe-inline'; base-uri 'none'",
    "c".repeat(64),
  );
  assert.match(preserved.csp, /IMG-SRC data:; media-src blob:/, "CSP-06");
  assert.match(preserved.csp, /ScRiPt-SrC 'nonce-cc+/, "CSP-06 case/whitespace parsing");
  assert.match(preserved.csp, /style-src 'unsafe-inline'; base-uri 'none'/, "CSP-06");

  const multiple = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; script-src 'nonce-first-valid' 'nonce-second-valid'",
  );
  assert.equal(multiple.nonce, "first-valid", "CSP-07");

  const malformed = bridgeWithCsp(
    HermesPageViewerPlugin,
    "default-src 'none'; script-src 'nonce-bad*value'",
  );
  assert.equal(malformed.script, "", "CSP-08");
  assert.equal(malformed.csp, "default-src 'none'; script-src 'nonce-bad*value'", "CSP-08 policy preserved");

  const currentLightbox = lightboxHarness({csp: "default-src 'none'; script-src 'none'"});
  assert.equal(currentLightbox.screenshot.attributes.role, "button", "CURRENT_NONE_CSP");
  assert.match(historicalCsp.page, /data-pagenest-viewer-lightbox/);
  assert.match(historicalCsp.page, /background: rgba\(0, 0, 0, \.66\)/);
  assert.match(historicalCsp.page, /backdrop-filter: blur\(8px\)/);
  assert.match(historicalCsp.page, /max-width: 90vw/);
  assert.match(historicalCsp.page, /max-height: 72vh/);
  assert.doesNotMatch(historicalCsp.page, /unsafe-eval/);
  view.clear();
  assert.equal(listeners.has("message"), false);
  console.log("obsidian plugin copy bridge tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
