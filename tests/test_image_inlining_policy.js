const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../extension/popup.js"), "utf8");
const start = source.indexOf("function inlineImagePolicy");
const end = source.indexOf("async function loadAiSettings", start);
assert.ok(start >= 0 && end > start, "image inlining helpers must be present");

const context = {URL, location: {href: "https://example.com"}};
vm.runInNewContext(`${source.slice(start, end)}\nthis.inlineImagePolicy = inlineImagePolicy;`, context);

assert.equal(
  JSON.stringify(context.inlineImagePolicy({url: "https://www.xiaohongshu.com/explore/example"})),
  JSON.stringify({maxImages: 40, maxBytes: 80 * 1024 * 1024}),
);
assert.equal(
  JSON.stringify(context.inlineImagePolicy({url: "https://example.feishu.cn/wiki/doc", page_variant: "feishu-document"})),
  JSON.stringify({maxImages: 200, maxBytes: 160 * 1024 * 1024}),
);
assert.equal(
  JSON.stringify(context.inlineImagePolicy({url: "local-html:///report.html", source_kind: "local-html"})),
  JSON.stringify({maxImages: 40, maxBytes: 80 * 1024 * 1024}),
);
assert.equal(context.inlineImagePolicy({url: "https://example.com/article"}), null);
console.log("browser image inlining policy passed");
