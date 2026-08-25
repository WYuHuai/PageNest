const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const vm = require("node:vm");

class TextFileView {}
class Plugin {}
class Modal {}
class Notice {}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return {Modal, Notice, Plugin, TextFileView};
  return originalLoad.call(this, request, parent, isMain);
};
const pluginPath = path.resolve(__dirname, "../obsidian-plugin/pagenest-viewer/main.js");
const Viewer = require(pluginPath);
Module._load = originalLoad;

class TextNode {
  constructor(value) {
    this.value = value;
    this.parentElement = null;
  }
  get textContent() { return this.value; }
  get outerHTML() { return this.value; }
}

class Element {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributeValues = {...attributes};
    this.childNodes = [];
    this.parentElement = null;
    this.style = {};
  }
  get attributes() {
    return Object.entries(this.attributeValues).map(([name, value]) => ({name, value}));
  }
  get children() { return this.childNodes.filter(child => child instanceof Element); }
  get textContent() { return this.childNodes.map(child => child.textContent).join(""); }
  setAttribute(name, value) { this.attributeValues[name] = String(value); }
  getAttribute(name) { return this.attributeValues[name] || ""; }
  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.childNodes = child.parentElement.childNodes.filter(item => item !== child);
    }
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }
  appendText(value) { return this.appendChild(new TextNode(value)); }
  querySelectorAll(selector) {
    const tags = selector.toUpperCase().split(",");
    const result = [];
    const visit = node => {
      node.children.forEach(child => {
        if (tags.includes(child.tagName)) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }
  replaceWith(replacement) {
    const index = this.parentElement.childNodes.indexOf(this);
    replacement.parentElement = this.parentElement;
    this.parentElement.childNodes[index] = replacement;
    this.parentElement = null;
  }
  get outerHTML() {
    const attributes = Object.entries(this.attributeValues)
      .map(([name, value]) => ` ${name}="${value}"`).join("");
    return `<${this.tagName.toLowerCase()}${attributes}>${this.childNodes.map(child => child.outerHTML).join("")}</${this.tagName.toLowerCase()}>`;
  }
}

function element(tagName, text = "", attributes = {}) {
  const node = new Element(tagName, attributes);
  if (text) node.appendText(text);
  return node;
}

function historicalContent() {
  const content = element("div", "", {"data-pagenest-role": "content", class: "article-body"});
  let parent = content;
  for (let index = 0; index < 4; index += 1) {
    const heading = element("h1");
    const section = element("section");
    heading.appendChild(section);
    parent.appendChild(heading);
    parent = section;
  }
  const leaf = element("span", "来源：城市建管法规务实");
  parent.appendChild(leaf);
  return {content, leaf};
}

function viewerDocument(source, content, {notebook = false} = {}) {
  const sourceMeta = element("meta", "", {content: source});
  const notebookEntry = notebook ? element("article", "", {"data-pagenest-notebook-entry": ""}) : null;
  return {
    body: element("body"),
    documentElement: element("html"),
    createElement: tagName => element(tagName),
    querySelector(selector) {
      if (selector === 'meta[name="hermes-source"]') return sourceMeta;
      if (selector === '[data-pagenest-role="content"]') return content;
      if (selector === "[data-pagenest-notebook-entry]") return notebookEntry;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
}

const runtime = Viewer.copyBridgeScript("a".repeat(64))
  .match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

function run(source, content, options = {}) {
  const document = viewerDocument(source, content, options);
  vm.runInNewContext(runtime, {
    URL,
    document,
    window: {parent: {postMessage() {}}},
  });
  return content;
}

function compoundedHeadingFont(leaf, base = 16) {
  let value = base;
  for (let node = leaf.parentElement; node; node = node.parentElement) {
    if (node.tagName === "H1") value *= 2.1;
  }
  return value;
}

const historicalName = "2026-08-25_《生态环境法典》：住建、城管执法人员须知悉的条款节选.pagenest";
const historical = historicalContent();
assert.ok(Math.abs(compoundedHeadingFont(historical.leaf) - 311.1696) < 0.0001, `${historicalName} old amplification`);
run("https://mp.weixin.qq.com/s/_bkAXusCRoLP2_uUPmpGnw", historical.content);
assert.equal(historical.content.querySelectorAll("h1,h2,h3,h4,h5,h6").length, 0, "VIEWER-WECHAT-01");
assert.equal(compoundedHeadingFont(historical.leaf), 16, "VIEWER-WECHAT-01 typography");
assert.equal(historical.leaf.textContent, "来源：城市建管法规务实", "VIEWER-WECHAT-01 content");

const singleTitle = element("div", "", {"data-pagenest-role": "content"});
singleTitle.appendChild(element("h1", "正常微信文章标题"));
const singleBefore = singleTitle.outerHTML;
run("https://mp.weixin.qq.com/s/normal", singleTitle);
assert.equal(singleTitle.outerHTML, singleBefore, "VIEWER-WECHAT-02");

const ordinaryArticle = element("div", "", {"data-pagenest-role": "content"});
const ordinaryHeading = element("h1", "正常标题");
const ordinarySection = element("section");
ordinarySection.appendChild(element("p", "普通正文"));
ordinaryArticle.appendChild(ordinaryHeading);
ordinaryArticle.appendChild(ordinarySection);
const ordinaryBefore = ordinaryArticle.outerHTML;
run("https://mp.weixin.qq.com/s/ordinary", ordinaryArticle);
assert.equal(ordinaryArticle.outerHTML, ordinaryBefore, "VIEWER-WECHAT-03/06");

const otherSite = historicalContent();
const otherBefore = otherSite.content.outerHTML;
run("https://example.com/article", otherSite.content);
assert.equal(otherSite.content.outerHTML, otherBefore, "VIEWER-WECHAT-04");

const notebook = historicalContent();
const notebookBefore = notebook.content.outerHTML;
run("https://mp.weixin.qq.com/s/video-source", notebook.content, {notebook: true});
assert.equal(notebook.content.outerHTML, notebookBefore, "VIEWER-WECHAT-05");

const mainSource = fs.readFileSync(pluginPath, "utf8");
assert.doesNotMatch(mainSource, /城市建管|_bkAXusCRoLP2_uUPmpGnw/);
assert.doesNotMatch(mainSource, /\.article-body\s+h1\s*\{[^}]*!important/s);

console.log("Viewer legacy WeChat nested heading tests passed");
