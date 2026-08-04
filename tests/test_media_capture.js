const assert = require("node:assert/strict");

global.location = {
  hostname: "www.bilibili.com",
  pathname: "/opus/123456",
  href: "https://www.bilibili.com/opus/123456",
};
global.document = {
  scripts: [{textContent: 'window.__INITIAL_STATE__={"bvid":"BV1j14y1F7Jr"}'}],
};
require("../extension/media-capture.js");

const media = globalThis.HermesMedia.pageVideo("video-slot", "poster.jpg");
assert.equal(media.page_url, "https://www.bilibili.com/video/BV1j14y1F7Jr/");
assert.equal(media.position_id, "video-slot");
assert.equal(media.source_url, "");
assert.equal(globalThis.HermesMedia.isPlayerControlText("00"), true);
assert.equal(globalThis.HermesMedia.isPlayerControlText("播放 倍速 全屏"), true);
assert.equal(globalThis.HermesMedia.isPlayerControlText("0.5倍 0.75倍 1.0倍 1.5倍 2.0倍"), true);
assert.equal(globalThis.HermesMedia.isPlayerControlText("正文中介绍如何播放视频"), false);


document.scripts = [];
document.querySelectorAll = () => [];
document.documentElement = {outerHTML: ""};
global.performance = {
  getEntriesByType: () => [{name: "https://api.bilibili.com/x/player/wbi/playurl?bvid=BV1Q5411c7mD&cid=1"}],
};
const resourceMedia = globalThis.HermesMedia.pageVideo("resource-video-slot");
assert.equal(resourceMedia.page_url, "https://www.bilibili.com/video/BV1Q5411c7mD/");
