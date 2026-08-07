const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extension = path.resolve(__dirname, "../extension");
const noop = () => {};
const core = new Proxy({findArticle: () => ({element: {}, method: "generic"})}, {
  get(target, property) { return property in target ? target[property] : noop; },
});
const context = vm.createContext({HermesExtractorCore: core});
context.globalThis = context;

for (const file of [
  "core/content-quality.js",
  "core/adapter-registry.js",
  "adapters/bilibili.js",
  "adapters/feishu.js",
  "adapters/wechat.js",
  "adapters/csdn.js",
  "adapters/guyue.js",
  "adapters/xiaohongshu.js",
  "adapters/generic.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(extension, file), "utf8"), context, {filename: file});
}

const adapters = context.HermesAdapters.list();
assert.deepEqual(
  Array.from(adapters, adapter => adapter.name),
  ["bilibili", "feishu", "wechat", "csdn", "guyue", "xiaohongshu", "generic"],
);
for (const adapter of adapters) {
  for (const method of ["detect", "preparePage", "extract", "cleanup", "validate"]) {
    assert.equal(typeof adapter[method], "function", `${adapter.name}.${method}`);
  }
}

function selected(hostname, pathname = "/article") {
  return context.HermesAdapters.select({location: {hostname, pathname}}).name;
}
assert.equal(selected("www.bilibili.com", "/video/BV1"), "bilibili");
assert.equal(selected("example.feishu.cn", "/wiki/doc"), "feishu");
assert.equal(selected("mp.weixin.qq.com", "/s/abc"), "wechat");
assert.equal(selected("blog.csdn.net", "/article/details/1"), "csdn");
assert.equal(selected("www.guyuehome.com", "/post/1"), "guyue");
assert.equal(selected("www.xiaohongshu.com", "/explore/1"), "xiaohongshu");
assert.equal(selected("example.com"), "generic");
console.log("adapter registry boundaries passed");
