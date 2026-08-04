const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

let viewFactory;
const registeredExtensions = [];
let legacyExtensionConflict = false;
let frame;
let copiedText = "";
let refreshHandler;
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

  registerExtensions(extensions) {
    registeredExtensions.push(extensions);
    if (legacyExtensionConflict && extensions.includes("hermes")) {
      throw new Error("extension already registered");
    }
  }
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

const pluginPath = path.resolve(__dirname, "../obsidian-plugin/pagenest-viewer/main.js");
const HermesPageViewerPlugin = require(pluginPath);
Module._load = originalLoad;

const plugin = new HermesPageViewerPlugin();
plugin.onload();
assert.equal(typeof viewFactory, "function");
assert.deepEqual(registeredExtensions, [["pagenest"], ["hermes"]]);

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
  await view.setViewData("<!doctype html><body><pre>const answer = 42;</pre></body>");

  assert.equal(frame.attributes.sandbox, "allow-popups allow-scripts");
  assert.equal(frame.attributes.allow, undefined);
  assert.match(frame.srcdoc, /data-hermes-copy-bridge/);
  assert.match(frame.srcdoc, /<pre>const answer = 42;<\/pre>/);
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

  view.clear();
  assert.equal(listeners.has("message"), false);
  console.log("obsidian plugin copy bridge tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
