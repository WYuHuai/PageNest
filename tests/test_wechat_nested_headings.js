const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";

class FixtureText {
  constructor(value, ownerDocument) {
    this.value = value;
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
  }
  get textContent() { return this.value; }
  cloneNode() { return new FixtureText(this.value, this.ownerDocument); }
  get outerHTML() { return this.value; }
}

class FixtureElement {
  constructor(tagName, ownerDocument, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributeValues = {...attributes};
    this.childNodes = [];
    this.parentElement = null;
    this.computedStyle = {fontSize: "17px", fontWeight: "400"};
  }
  get attributes() {
    return Object.entries(this.attributeValues).map(([name, value]) => ({name, value}));
  }
  get children() { return this.childNodes.filter(child => child instanceof FixtureElement); }
  get textContent() { return this.childNodes.map(child => child.textContent).join(""); }
  get innerText() { return this.textContent; }
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
  appendText(value) { return this.appendChild(new FixtureText(value, this.ownerDocument)); }
  contains(node) {
    return node === this || this.children.some(child => child.contains(node));
  }
  matches(selector) {
    if (selector === "#js_content") return this.getAttribute("id") === "js_content";
    return selector.toUpperCase().split(",").includes(this.tagName);
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  querySelectorAll(selector) {
    const tags = selector.toUpperCase().split(",");
    const result = [];
    const visit = node => {
      for (const child of node.children) {
        if (tags.includes(child.tagName)) result.push(child);
        visit(child);
      }
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
  cloneNode(deep = false) {
    const clone = new FixtureElement(this.tagName, this.ownerDocument, this.attributeValues);
    clone.computedStyle = {...this.computedStyle};
    if (deep) this.childNodes.forEach(child => clone.appendChild(child.cloneNode(true)));
    return clone;
  }
  get outerHTML() {
    const attributes = Object.entries(this.attributeValues)
      .map(([name, value]) => ` ${name}="${value}"`).join("");
    return `<${this.tagName.toLowerCase()}${attributes}>${this.childNodes.map(child => child.outerHTML).join("")}</${this.tagName.toLowerCase()}>`;
  }
}

function fixtureDocument() {
  const document = {
    defaultView: {getComputedStyle: node => node.computedStyle},
    createElement(tagName) { return new FixtureElement(tagName, document); },
  };
  return document;
}

function element(document, tagName, text = "", attributes = {}) {
  const node = new FixtureElement(tagName, document, attributes);
  if (text) node.appendText(text);
  return node;
}

function nestedFixture({large = false} = {}) {
  const document = fixtureDocument();
  const root = element(document, "div", "", {id: "js_content"});
  root.computedStyle = {fontSize: "17px", fontWeight: "400"};
  let parent = root;
  for (let index = 0; index < 4; index += 1) {
    const heading = element(document, "h1", "", {"data-level": String(index + 1)});
    heading.computedStyle = large && index === 0
      ? {fontSize: "30px", fontWeight: "700"}
      : {fontSize: "16px", fontWeight: "400"};
    const section = element(document, "section");
    heading.appendChild(section);
    parent.appendChild(heading);
    parent = section;
  }
  const span = element(document, "span");
  span.appendText("来源：");
  const strong = element(document, "strong", "城市建管");
  const link = element(document, "a", "法规务实", {href: "https://example.test/author"});
  const image = element(document, "img", "", {src: "https://example.test/avatar.png"});
  span.appendChild(strong);
  span.appendChild(link);
  span.appendChild(image);
  parent.appendChild(span);
  return {document, root};
}

let adapter;
const adapterSource = fs.readFileSync(
  path.resolve(__dirname, "../extension/adapters/wechat.js"),
  "utf8",
);
vm.runInNewContext(adapterSource, {
  HermesAdapters: {register(value) { adapter = value; }},
  PageNestContentQuality: {isReadableArticle: () => true},
});

function transform(source, hostname = "mp.weixin.qq.com") {
  const clone = source.root.cloneNode(true);
  adapter.transformClone(clone, {
    document: source.document,
    location: {hostname},
    sourceElement: source.root,
  });
  return clone;
}

const ordinary = nestedFixture();
const normalized = transform(ordinary);
assert.equal(normalized.querySelectorAll(HEADING_SELECTOR).length, 0, "WECHAT-HEAD-01");
assert.equal(normalized.textContent, ordinary.root.textContent, "WECHAT-HEAD-05");
assert.match(normalized.outerHTML, /<strong>城市建管<\/strong>/, "WECHAT-HEAD-06 strong");
assert.match(normalized.outerHTML, /<a href="https:\/\/example\.test\/author">法规务实<\/a>/, "WECHAT-HEAD-06 link");
assert.match(normalized.outerHTML, /<span>来源：/, "WECHAT-HEAD-06 span");
assert.match(normalized.outerHTML, /<img src="https:\/\/example\.test\/avatar\.png">/, "WECHAT-HEAD-06 image");

const large = nestedFixture({large: true});
assert.equal(transform(large).querySelectorAll(HEADING_SELECTOR).length, 4, "WECHAT-HEAD-02");

const singleDocument = fixtureDocument();
const singleRoot = element(singleDocument, "div", "", {id: "js_content"});
singleRoot.appendChild(element(singleDocument, "h1", "真正的单层标题"));
assert.equal(transform({document: singleDocument, root: singleRoot}).querySelectorAll(HEADING_SELECTOR).length, 1, "WECHAT-HEAD-03");

const paragraphDocument = fixtureDocument();
const paragraphRoot = element(paragraphDocument, "div", "", {id: "js_content"});
paragraphRoot.appendChild(element(paragraphDocument, "p", "普通正文"));
const paragraphBefore = paragraphRoot.outerHTML;
assert.equal(transform({document: paragraphDocument, root: paragraphRoot}).outerHTML, paragraphBefore, "WECHAT-HEAD-04");

assert.equal(transform(nestedFixture(), "example.com").querySelectorAll(HEADING_SELECTOR).length, 4, "host boundary");
const noStyle = nestedFixture();
noStyle.document.defaultView = {};
assert.equal(transform(noStyle).querySelectorAll(HEADING_SELECTOR).length, 4, "computed-style fail closed");
assert.doesNotMatch(adapterSource, /城市建管|_bkAXusCRoLP2_uUPmpGnw/);

console.log("WeChat nested heading normalization tests passed");
