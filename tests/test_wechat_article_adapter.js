const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let adapter;
const calls = [];
const source = fs.readFileSync(path.resolve(__dirname, "../extension/adapters/wechat.js"), "utf8");
const popupSource = fs.readFileSync(path.resolve(__dirname, "../extension/popup.js"), "utf8");
vm.runInNewContext(source, {
  HermesAdapters: {register(value) { adapter = value; }},
  HermesExtractorCore: {
    collectImages(root, prefix, options) {
      calls.push({root, prefix, options});
      return [{position_id: "inline-emoji"}];
    },
  },
  PageNestContentQuality: {isReadableArticle: value => String(value || "").length > 20},
});

const primary = {
  querySelector(selector) {
    return {
      "#activity-name": {textContent: "脱敏微信文章"},
      "#js_name": {textContent: "示例作者"},
      "#publish_time": {textContent: "2026-09-01"},
    }[selector] || null;
  },
};
const content = {
  innerText: "这是足够长的脱敏微信公众号正文，用于验证文章根节点选择。",
  textContent: "这是足够长的脱敏微信公众号正文，用于验证文章根节点选择。",
  closest(selector) { return selector === ".rich_media_area_primary" ? primary : null; },
};
const document = {
  querySelector(selector) {
    if (selector === "#js_content") return content;
    if (selector === ".rich_media_area_primary") return primary;
    return null;
  },
};

(async () => {
  assert.equal(adapter.specialized, true);
  assert.equal(adapter.detect({location: {hostname: "mp.weixin.qq.com"}}), true);
  assert.equal(adapter.detect({location: {hostname: "weixin.qq.com"}}), false);
  assert.equal(adapter.detect({location: {hostname: "evil.mp.weixin.qq.com.test"}}), false);

  const result = await adapter.extract({document});
  assert.equal(result.element, primary);
  assert.equal(result.page_variant, "wechat-article");
  assert.equal(result.title, "脱敏微信文章");
  assert.equal(result.author, "示例作者");
  assert.equal(result.published_at, "2026-09-01");
  assert.equal(result.images[0].position_id, "inline-emoji");
  assert.equal(calls[0].options.minimumImageSize, 12);
  assert.match(popupSource, /hostname === "mp\.weixin\.qq\.com"/);
  for (const boundary of ["comment_area", "reward_area", "[class*='share']", "[class*='advertisement']"]) {
    assert.ok(source.includes(boundary), `missing WeChat non-article boundary: ${boundary}`);
  }
  console.log("WeChat article adapter tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
