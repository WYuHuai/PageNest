const assert = require("node:assert/strict");
require("../extension/core/content-quality.js");
require("../extension/capture-selection.js");

const top = {
  frameId: 0,
  result: {
    title: "DIY 教程 - 飞书云文档",
    author: "",
    site_name: "feishu.cn",
    url: "https://example.feishu.cn/wiki/doc",
    canonical_url: "",
    article_html: '<article><h1>DIY 教程</h1><p>真正正文</p><img data-hermes-image-id="image-1"></article>',
    article_text: "真正正文 ".repeat(800),
    images: [{position_id: "image-1"}],
    media: [],
    headings: ["DIY 教程"],
    marker_diagnostics: {images: 1, markers: 1, missing: 0},
    extraction_method: "feishu-virtual-document:120-blocks",
    image_placement_policy: "strict",
    frame_kind: "article",
  },
};
const navigationFrame = {
  frameId: 7,
  result: {
    title: "embedded app",
    article_html: "<article>ESP32 智能手表 直升机 图纸分享</article>",
    article_text: "目录 ".repeat(5000),
    images: [],
    media: [],
    headings: [],
    extraction_method: "selector:main",
    frame_kind: "navigation",
  },
};
const mediaFrame = {
  frameId: 9,
  result: {
    title: "player",
    article_html: "<article>0/0 00:00/05:56 进度条 播放 倍速 超清 流畅</article>",
    article_text: "0/0 00:00/05:56 进度条 播放 倍速 超清 流畅",
    images: [],
    media: [{
      position_id: "video-1",
      kind: "video",
      page_url: "https://www.bilibili.com/video/BV1j14y1F7Jr/",
    }],
    headings: [],
    extraction_method: "whole-page-fallback",
    frame_kind: "media",
  },
};

const chosen = globalThis.selectBestCapture(
  [top, navigationFrame, mediaFrame],
  {title: "DIY 教程 - 飞书云文档", url: "https://example.feishu.cn/wiki/doc"},
);

assert.equal(chosen.url, "https://example.feishu.cn/wiki/doc");
assert.equal(chosen.extraction_method, "feishu-virtual-document:120-blocks");
assert.equal(chosen.images.length, 1);
assert.equal(chosen.media.length, 1);
assert.match(chosen.article_html, /data-hermes-media-id="video-1"/);
assert.doesNotMatch(chosen.article_html, /进度条|倍速|超清|流畅/);
const scriptBundle = [
  "!function(){var e={576:function(e,t){\"use strict\";",
  "Object.defineProperty(t,\"__esModule\",{value:!0});",
  "throw new TypeError(\"Generator is already executing\");",
  "}".repeat(1500),
].join("");
assert.equal(PageNestContentQuality.looksLikeScriptBundle(scriptBundle), true);

const wechatCapture = globalThis.selectBestCapture([
  {
    frameId: 0,
    result: {
      title: "微信文章",
      url: "https://mp.weixin.qq.com/s/example",
      article_html: `<main><p>${scriptBundle}</p></main>`,
      article_text: scriptBundle,
      images: [],
      media: [],
      headings: [],
      extraction_method: "selector:main",
      frame_kind: "article",
    },
  },
  {
    frameId: 3,
    result: {
      title: "微信正文",
      url: "https://mp.weixin.qq.com/s/example",
      article_html: "<article><h1>真正正文</h1><p>这是正确的微信文章内容。</p></article>",
      article_text: "这是正确的微信文章内容。".repeat(30),
      images: [],
      media: [],
      headings: ["真正正文"],
      extraction_method: "wechat:#js_content",
      frame_kind: "article",
    },
  },
], {title: "微信文章", url: "https://mp.weixin.qq.com/s/example"});
assert.equal(wechatCapture.extraction_method, "embedded-frame:3:wechat:#js_content");
assert.doesNotMatch(wechatCapture.article_text, /Generator is already executing/);
console.log("capture selection passed");
