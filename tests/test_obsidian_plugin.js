const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

let viewFactory;
let frame;
let copiedText = "";
let frameLoadHandler;
let frameClickHandler;
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

  registerExtensions() {}
  register() {}
  addCommand() {}
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return {Plugin, TextFileView};
  if (request === "electron") {
    return {clipboard: {writeText: (text) => { copiedText = text; }}};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const pluginPath = path.resolve(__dirname, "../obsidian-plugin/hermes-page-viewer/main.js");
const HermesPageViewerPlugin = require(pluginPath);
Module._load = originalLoad;

const plugin = new HermesPageViewerPlugin();
plugin.onload();
assert.equal(typeof viewFactory, "function");

const refresh = {addEventListener() {}};
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
      contentDocument: {
        addEventListener(type, listener, capture) {
          assert.equal(type, "click");
          assert.equal(capture, true);
          frameClickHandler = listener;
        },
      },
      srcdoc: "",
      attributes: options.attr,
      addEventListener(type, listener) {
        assert.equal(type, "load");
        frameLoadHandler = listener;
      },
    };
    return frame;
  },
};

(async () => {
  const view = viewFactory({contentEl});
  await view.setViewData("<pre>const answer = 42;</pre>");

  assert.equal(frame.attributes.sandbox, "allow-popups allow-scripts allow-same-origin");
  assert.equal(frame.attributes.allow, "clipboard-write");
  assert.equal(frame.srcdoc, "<pre>const answer = 42;</pre>");
  frameLoadHandler();
  const code = {
    innerText: "const direct = true;",
    querySelectorAll() { return []; },
  };
  const shell = {querySelector(selector) { assert.equal(selector, "pre"); return code; }};
  const button = {
    textContent: "复制代码",
    closest(selector) { assert.equal(selector, '[data-hermes-kind="code-shell"]'); return shell; },
  };
  let prevented = false;
  let stopped = false;
  await frameClickHandler({
    target: {closest(selector) { assert.equal(selector, "[data-hermes-copy]"); return button; }},
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; },
  });
  assert.equal(copiedText, "const direct = true;");
  assert.equal(button.textContent, "已复制");
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  const handler = listeners.get("message");
  assert.equal(typeof handler, "function");
  await handler({source: frame.contentWindow, data: {type: "hermes-copy", text: "const answer = 42;"}});
  assert.equal(copiedText, "const answer = 42;");

  await handler({source: {}, data: {type: "hermes-copy", text: "blocked"}});
  assert.equal(copiedText, "const answer = 42;");

  view.clear();
  assert.equal(listeners.has("message"), false);
  console.log("obsidian plugin copy bridge tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
