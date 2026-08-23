const assert = require("node:assert/strict");
const vm = require("node:vm");
const feedback = require("../extension/core/video-notebook-feedback.js");

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
  }
  set innerHTML(_value) { throw new Error("innerHTML must not be used"); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  attachShadow() { this.shadowRoot = new Element("shadow-root", this.ownerDocument); return this.shadowRoot; }
  remove() {
    this.removed = true;
    if (this.id) this.ownerDocument.elements.delete(this.id);
  }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}

class Document {
  constructor() {
    this.elements = new Map();
    this.documentElement = new Element("html", this);
    this.documentElement.appendChild = (child) => {
      this.documentElement.children.push(child);
      if (child.id) this.elements.set(child.id, child);
      return child;
    };
  }
  createElement(tagName) { return new Element(tagName, this); }
  getElementById(id) { return this.elements.get(id) || null; }
}

function all(root) {
  return [root, ...root.children.flatMap(all)];
}

(async () => {
  const originalDocument = global.document;
  const originalChrome = global.chrome;
  const originalSetTimeout = global.setTimeout;
  const document = new Document();
  const messages = [];
  global.document = document;
  global.chrome = { runtime: { sendMessage: async (message) => {
    messages.push(message);
    return { ok: true, session: { relative_path: "Video Notebooks/Renamed.pagenest" } };
  } } };
  global.setTimeout = (callback, delay) => { global.lastTimer = { callback, delay }; return 1; };

  try {
    const hostile = '<img src=x onerror="alert(1)">';
    feedback.renderFeedback({
      mode: "started",
      title: hostile,
      notebook_id: "notebook-1",
      namespace: "pagenest.extension.runtime",
      protocol_version: 1,
      rename_type: "RENAME_VIDEO_NOTEBOOK",
    });

    const host = document.getElementById(feedback.HOST_ID);
    assert.ok(host);
    assert.ok(host.shadowRoot);
    const nodes = all(host.shadowRoot);
    const input = nodes.find((node) => node.tagName === "INPUT");
    const button = nodes.find((node) => node.tagName === "BUTTON");
    assert.equal(input.value, hostile);
    assert.equal(nodes.some((node) => node.tagName === "IMG"), false);
    input.value = "Renamed";
    await button.listeners.click({ preventDefault() {} });
    assert.deepEqual(messages[0], {
      namespace: "pagenest.extension.runtime",
      protocol_version: 1,
      type: "RENAME_VIDEO_NOTEBOOK",
      notebook_id: "notebook-1",
      title: "Renamed",
    });

    feedback.renderFeedback({ mode: "saved", timestamp: "00:49", duration_ms: 1200 });
    const toast = document.getElementById(feedback.HOST_ID);
    assert.match(all(toast.shadowRoot).map((node) => node.textContent).join(" "), /✓ 已保存 00:49/);
    assert.equal(global.lastTimer.delay, 1200);

    assert.equal(feedback.hideTransientUi(), true);
    assert.equal(toast.hidden, true);

    feedback.renderFeedback({ mode: "error", message: '<script>alert(1)</script>' });
    const errorHost = document.getElementById(feedback.HOST_ID);
    assert.match(all(errorHost.shadowRoot).map((node) => node.textContent).join(" "), /操作未完成/);
    assert.equal(all(errorHost.shadowRoot).some((node) => node.tagName === "SCRIPT"), false);

    const serializedHide = vm.runInNewContext(`(${feedback.hideTransientUi.toString()})`, { document });
    assert.equal(serializedHide(), true);
    const serializedRender = vm.runInNewContext(
      `(${feedback.renderFeedback.toString()})`,
      { document, chrome: global.chrome, setTimeout: global.setTimeout }
    );
    assert.equal(serializedRender({ mode: "saved", timestamp: "01:02", duration_ms: 1200 }), true);
  } finally {
    global.document = originalDocument;
    global.chrome = originalChrome;
    global.setTimeout = originalSetTimeout;
    delete global.lastTimer;
  }

  assert.match(feedback.renderFeedback.toString(), /attachShadow/);
  assert.doesNotMatch(feedback.renderFeedback.toString(), /innerHTML/);
  console.log("video notebook feedback tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
