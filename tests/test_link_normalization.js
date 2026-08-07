const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeNode {
  constructor(tag, attrs = {}, text = "") {
    this.tag = tag.toLowerCase();
    this.attrs = {...attrs};
    this.textContent = text;
    this.innerText = text;
    this.children = [];
    this.replacement = null;
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  set href(value) { this.attrs.href = value; }
  get href() { return this.attrs.href || ""; }
  matches(selector) {
    return selector.split(",").some((part) => part.trim().toLowerCase() === this.tag);
  }
  querySelector(selector) {
    const tags = selector.split(",").map((part) => part.trim().toLowerCase());
    return this.children.find((child) => tags.includes(child.tag)) || null;
  }
  append(...items) {
    for (const item of items) {
      if (typeof item === "string") this.textContent += item;
      else this.children.push(item);
    }
  }
  replaceWith(node) { this.replacement = node; }
}

const emptyRedirect = new FakeNode("a", {
  href: "https://link.csdn.net/?target=https%3A%2F%2Fgithub.com%2Fexample%2Frobot",
});
const emptyArticleLink = new FakeNode("a", {href: "https://mp.weixin.qq.com/s/example"});
const linkedImage = new FakeNode("img", {src: "data:image/png;base64,AA=="});
const imageLink = new FakeNode("a", {href: "https://example.com/article"});
imageLink.children.push(linkedImage);
const reportLink = new FakeNode("span", {
  "data-report-click": JSON.stringify({dest: "https://github.com/example/firmware"}),
}, "源码");
const iconLink = new FakeNode("img", {"data-href": "https://gitee.com/example/robot"});
const linkedNodes = [reportLink, iconLink];
const root = {
  querySelectorAll(selector) {
    if (selector === "a") return [emptyRedirect, emptyArticleLink, imageLink];
    return linkedNodes;
  },
};

const source = fs.readFileSync(path.resolve(__dirname, "../extension/core/extractor-core.js"), "utf8");
const start = source.indexOf("  function externalLinkLabel");
const end = source.indexOf("  function collectImages", start);
assert.ok(start >= 0 && end > start, "link normalization helpers must be present");

const context = {
  URL,
  location: {href: "https://blog.csdn.net/example/article/details/1"},
  document: {createElement: (tag) => new FakeNode(tag)},
};
vm.runInNewContext(
  `${source.slice(start, end)}\nthis.normalizeLinks = normalizeLinks; this.unwrapHeadingLinks = unwrapHeadingLinks;`,
  context,
);
context.normalizeLinks(root);

assert.equal(emptyRedirect.href, "https://github.com/example/robot");
assert.match(emptyRedirect.textContent, /GitHub/);
assert.equal(emptyArticleLink.textContent, "");
assert.deepEqual(imageLink.children, [linkedImage]);
assert.equal(imageLink.textContent, "");
assert.equal(reportLink.children[0].href, "https://github.com/example/firmware");
assert.match(reportLink.children[0].textContent, /GitHub/);
assert.equal(iconLink.replacement.href, "https://gitee.com/example/robot");

const headingLink = {
  childNodes: [{textContent: "无链接标题"}],
  replaceWith(...nodes) { this.replacement = nodes; },
};
const headingRoot = {
  querySelectorAll(selector) {
    if (selector === "h1,h2,h3,h4,h5,h6") {
      return [{querySelectorAll: () => [headingLink]}];
    }
    return [];
  },
};
context.unwrapHeadingLinks(headingRoot);
assert.equal(headingLink.replacement[0].textContent, "无链接标题");
console.log("CSDN and code-host link normalization tests passed");
