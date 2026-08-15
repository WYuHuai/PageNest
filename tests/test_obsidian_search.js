const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

let lastNotice = "";
class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = {empty() {}};
    this.closed = false;
  }
  close() { this.closed = true; }
}
class Notice {
  constructor(message) { lastNotice = message; }
}
class Plugin {}
class TextFileView {}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return {Modal, Notice, Plugin, TextFileView};
  return originalLoad.call(this, request, parent, isMain);
};
const searchPath = path.resolve(__dirname, "../obsidian-plugin/pagenest-viewer/main.js");
const {
  PageNestSearchModal,
  markdownLibrary,
  searchIndexDocuments,
  writeMarkdownLibrary,
} = require(searchPath);
Module._load = originalLoad;

const documents = {
  "研究/正文.pagenest": {
    title: "TimesFM 预测",
    source: "https://example.com/timesfm",
    text: "时间序列 Python 代码 已加载评论：适合科研",
  },
  "其他.hermes": {
    title: "普通文章",
    source: "",
    text: "时间序列基础",
  },
};

const results = searchIndexDocuments(documents, "时间序列 科研");
assert.equal(results.length, 1);
assert.equal(results[0].path, "研究/正文.pagenest");
assert.match(results[0].snippet, /科研/);
assert.deepEqual(searchIndexDocuments(documents, "   "), []);

const library = markdownLibrary(documents);
assert.match(library, /^<!-- pagenest-generated-library:v1 -->/);
assert.match(library, /# PageNest Library/);
assert.match(library, /## TimesFM 预测/);
assert.match(library, /时间序列 Python 代码/);
assert.doesNotMatch(library, /<html|data:image/);

(async () => {
  let opened = null;
  const file = {path: "研究/正文.pagenest"};
  const app = {
    vault: {getAbstractFileByPath: (value) => value === file.path ? file : null},
    workspace: {getLeaf: () => ({openFile: async (value) => { opened = value; }})},
  };
  const modal = new PageNestSearchModal(app);
  await modal.openResult(file.path);
  assert.equal(opened, file);
  assert.equal(modal.closed, true);

  await modal.openResult("missing.pagenest");
  assert.match(lastNotice, /移动或删除/);

  const files = new Map();
  const exportApp = {
    vault: {
      adapter: {
        exists: async (path) => files.has(path),
        read: async (path) => files.get(path),
        write: async (path, value) => files.set(path, value),
      },
    },
  };
  assert.equal(await writeMarkdownLibrary(exportApp, documents), 2);
  assert.match(files.get("PageNest Library.md"), /普通文章/);
  files.set("PageNest Library.md", "# 用户自己的文件\n");
  await assert.rejects(
    () => writeMarkdownLibrary(exportApp, documents),
    /不会覆盖已有的 PageNest Library\.md/,
  );
  console.log("obsidian search index tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
