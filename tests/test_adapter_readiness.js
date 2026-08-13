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
    waitForContent: predicate => Promise.resolve(predicate() || predicate()),
    findArticleBySelectors: state.findArticleBySelectors || (() => null),
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

function image(src = "https://sns-img-qc.xhscdn.com/image.jpg", slideIndex = null) {
  const slide = slideIndex == null ? null : {getAttribute: name => name === "data-swiper-slide-index" ? String(slideIndex) : ""};
  return {
    src,
    className: "note-image",
    alt: "主图",
    naturalWidth: 800,
    naturalHeight: 600,
    getAttribute: name => name === "src" ? src : "",
    closest: selector => selector.includes("data-swiper-slide-index") ? slide : null,
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

function guyueDocument(root, selector = "main") {
  return {
    querySelector: value => value === selector ? root : null,
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
    querySelector: () => null,
  };
  const readyXhs = loadAdapter("xiaohongshu.js", {
    hostname: "www.xiaohongshu.com",
    pathname: "/explore/note-1",
    document: xhsDocument({root: xhsRoot, images: [image()], meta: true}),
  });
  assert.equal(await readyXhs.preparePage(), true, "正文和主图出现后应 ready");

  const duplicate = image();
  const comment = image("https://sns-img-qc.xhscdn.com/comment.jpg");
  const media = {querySelectorAll: selector => selector === "img" ? [image(), duplicate] : []};
  const title = {innerText: "笔记标题"};
  const description = {innerText: "这是一篇已经加载完成的笔记正文，内容足够长。"};
  const extractedRoot = {
    innerText: `${title.innerText} ${description.innerText}`,
    querySelector: selector => {
      if (selector.includes("note-slider")) return media;
      if (selector === ".note-title") return title;
      if (selector === ".note-content") return description;
      return null;
    },
    querySelectorAll: selector => selector === "img" ? [image(), duplicate, comment] : [],
  };
  const element = tagName => ({
    tagName,
    children: [],
    attributes: {},
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  const extractedDocument = xhsDocument({root: extractedRoot, images: [image(), duplicate, comment]});
  extractedDocument.createElement = element;
  extractedDocument.querySelectorAll = selector => selector.includes("#noteContainer .comment-item")
    ? [{innerText: "这是一条已经加载的评论。"}]
    : [];
  const extractingXhs = loadAdapter("xiaohongshu.js", {
    hostname: "www.xiaohongshu.com",
    pathname: "/explore/note-2",
    document: extractedDocument,
  });
  const extraction = await extractingXhs.extract();
  assert.equal(extraction.images.length, 1, "duplicate carousel nodes must produce one saved image");
  assert.equal(extraction.method, "xiaohongshu:note:1-images");
  assert.equal(extraction.comments.length, 0, "comments stay separate from the article body");

  const third = image("https://sns-img-qc.xhscdn.com/third.jpg", 2);
  const clonedThird = image("https://sns-img-qc.xhscdn.com/third.jpg", 2);
  const firstImage = image("https://sns-img-qc.xhscdn.com/first.jpg", 0);
  const second = image("https://sns-img-qc.xhscdn.com/second.jpg", 1);
  const orderedMedia = {querySelectorAll: selector => selector === "img" ? [clonedThird, firstImage, second, third] : []};
  const orderedRoot = {
    innerText: `${title.innerText} ${description.innerText}`,
    querySelector: selector => selector.includes("note-slider") ? orderedMedia : selector === ".note-title" ? title : selector === ".note-content" ? description : null,
    querySelectorAll: () => [],
  };
  const orderedDocument = xhsDocument({root: orderedRoot});
  orderedDocument.createElement = element;
  const orderedAdapter = loadAdapter("xiaohongshu.js", {
    hostname: "www.xiaohongshu.com",
    pathname: "/explore/note-ordered",
    document: orderedDocument,
  });
  const ordered = await orderedAdapter.extract();
  assert.deepEqual(Array.from(ordered.images, item => item.resolved_url), [firstImage.src, second.src, third.src]);

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

  let guyueSelectors = [];
  const legacyGuyue = loadAdapter("guyue.js", {
    hostname: "www.guyuehome.com",
    pathname: "/wap/detail",
    document: guyueDocument(article, ".detail-fuwenben .html"),
    findArticleBySelectors: selectors => {
      guyueSelectors = selectors;
      return {element: article, method: "guyue:.detail-fuwenben .html"};
    },
  });
  assert.equal(await legacyGuyue.preparePage(), true);
  assert.equal((await legacyGuyue.extract()).method, "guyue:.detail-fuwenben .html");
  assert.ok(guyueSelectors.includes(".detail-fuwenben .html"));

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
