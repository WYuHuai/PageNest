const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const observed = [];
const context = {
  URL,
  location: {href: "https://www.xiaohongshu.com/explore/current"},
  performance: {
    now: () => 500,
    getEntriesByType: () => [
      {name: "https://fe-video-qc.xhscdn.com/player.ico", startTime: 50},
      {name: "https://sns-video-qc.xhscdn.com/spectrum/older", startTime: 100},
      {name: "https://sns-video-hw.xhscdn.com/stream/current", startTime: 200},
    ],
  },
  PerformanceObserver: class {
    constructor(callback) { observed.push(callback); }
    observe() {}
  },
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync("extension/adapters/xiaohongshu-video-observer.js", "utf8"), context);

assert.deepEqual(
  Array.from(context.PageNestXhsVideoObserver.recent()),
  [
    "https://sns-video-hw.xhscdn.com/stream/current",
    "https://sns-video-qc.xhscdn.com/spectrum/older",
  ],
);
observed[0]({getEntries: () => [{name: "https://sns-video-bd.xhscdn.com/vod/latest.mp4", startTime: 300}]});
assert.equal(context.PageNestXhsVideoObserver.recent()[0], "https://sns-video-bd.xhscdn.com/vod/latest.mp4");
console.log("xiaohongshu video observer tests passed");
