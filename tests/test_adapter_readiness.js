const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extension = path.resolve(__dirname, "../extension");

function loadAdapter(file, state) {
  let registered;
  const core = {
    POSITION_ATTR: "data-hermes-image-id",
    addTextElement() {},
    markImagePosition: () => "image-1",
    metadata: () => state.meta || "",
    resolveImage: image => image.src || "",
    waitForContent: predicate => Promise.resolve(predicate()),
    findArticleBySelectors: () => null,
  };
  const context = vm.createContext({
    HermesExtractorCore: core,
    HermesAdapters: {register: adapter => { registered = adapter; }},
    document: state.document,
    location: {hostname: state.hostname, pathname: state.pathname},
    URL,
  });
  vm.runInContext(fs.readFileSync(path.join(extension, "adapters", file), "utf8"), context, {filename: file});
  return registered;
}

function image() {
  return {
    src: "https://sns-img-qc.xhscdn.com/image.jpg",
    className: "note-image",
    alt: "主图",
    naturalWidth: 800,
    naturalHeight: 600,
    getAttribute: name => name === "src" ? "https://sns-img-qc.xhscdn.com/image.jpg" : "",
  };
}

function xhsDocument({root = null, images = [], meta = false} = {}) {
  return {
    images,
    title: "小红书笔记",
    querySelector: selector => {
      if (selector.startsWith("meta[") && meta) return {content: "笔记标题"};
      if (selector.startsWith("#detail-container") && root) return root;
      return null;
    },
    querySelectorAll: () => [],
  };
}

function guyueDocument(root) {
  return {
    querySelector: selector => selector === "main" ? root : null,
    querySelectorAll: () => [],
  };
}

(async () => {
  const xhs = loadAdapter("xiaohongshu.js", {
    hostname: "www.xiaohongshu.com",
    pathname: "/explore/note-1",
    meta: true,
    document: xhsDocument({meta: true}),
  });
  assert.equal(await xhs.preparePage(), false, "metadata alone must not be ready");

  const xhsRoot = {
    innerText: "这是一篇已经加载正文的小红书笔记，包含足够的核心内容。",
    querySelectorAll: selector => selector === "img" ? [image()] : [],
  };
  const readyXhs = loadAdapter("xiaohongshu.js", {
    hostname: "www.xiaohongshu.com",
    pathname: "/explore/note-1",
    document: xhsDocument({root: xhsRoot, images: [image()], meta: true}),
  });
  assert.equal(await readyXhs.preparePage(), true, "正文和主图出现后应 ready");

  const shell = {innerText: "页面壳", querySelectorAll: () => []};
  const guyue = loadAdapter("guyue.js", {
    hostname: "www.guyuehome.com",
    pathname: "/post/1",
    document: guyueDocument(shell),
  });
  assert.equal(await guyue.preparePage(), false, "古月居页面壳不能视为 ready");

  const article = {
    innerText: "古月居正文已经加载，这里有足够的文章内容用于确认页面不是空壳。".repeat(4),
    querySelectorAll: () => [],
  };
  const readyGuyue = loadAdapter("guyue.js", {
    hostname: "www.guyuehome.com",
    pathname: "/post/1",
    document: guyueDocument(article),
  });
  assert.equal(await readyGuyue.preparePage(), true, "古月居正文出现后应 ready");

  const coreContext = vm.createContext({setTimeout, clearTimeout, document: {}, PageNestContentQuality: {}});
  vm.runInContext(fs.readFileSync(path.join(extension, "core", "extractor-core.js"), "utf8"), coreContext);
  let ready = false;
  setTimeout(() => { ready = true; }, 50);
  const started = Date.now();
  assert.equal(await coreContext.HermesExtractorCore.waitForContent(() => ready, 150, 10), true);
  assert.ok(Date.now() - started >= 40, "waitForContent must wait for delayed content");
  assert.equal(await coreContext.HermesExtractorCore.waitForContent(() => false, 35, 10), false);
  console.log("adapter readiness tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
