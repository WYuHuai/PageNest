const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.location = {
  pathname: "/explore/current-note",
  href: "https://www.xiaohongshu.com/explore/current-note",
};
global.performance = {getEntriesByType: () => []};
global.__INITIAL_STATE__ = {
  note: {
    noteDetailMap: {
      "other-note": {note: {noteId: "other-note", video: {media: {stream: {h264: [{masterUrl: "https://sns-video-bd.xhscdn.com/spectrum/wrong"}]}}}}},
      "current-note": {note: {noteId: "current-note", video: {media: {stream: {h264: [{masterUrl: "https://sns-video-hw.xhscdn.com/stream/right"}]}}}}},
    },
  },
};

vm.runInThisContext(fs.readFileSync("extension/adapters/xiaohongshu-video-bridge.js", "utf8"));

const popupSource = fs.readFileSync("extension/popup.js", "utf8");
assert.match(
  popupSource,
  /PageNestXhsVideoBridge\.apply\(article,tab\.id,chrome\.scripting,false\)/,
  "identification should resolve only metadata instead of downloading the video",
);
assert.match(
  popupSource,
  /await prepareCaptureForSave\(article\);\s*const data=await collectWithServiceCapabilities\(article\)/,
  "browser-readable media must be embedded immediately before saving",
);

(async () => {
  assert.equal(
    await global.PageNestXhsVideoBridge.resolveInPage(),
    "https://sns-video-hw.xhscdn.com/stream/right",
    "the current note's H.264 stream must win over recommendation data",
  );

  global.__INITIAL_STATE__ = {};
  global.performance = {getEntriesByType: () => [{
    name: "https://fe-video-qc.xhscdn.com/fe-platform/player.ico",
    initiatorType: "img",
    startTime: 9999,
  }]};
  assert.equal(await global.PageNestXhsVideoBridge.resolveInPage(), "", "static assets on misleading hosts must be rejected");

  global.__INITIAL_STATE__ = {
    note: {noteDetailMap: {"current-note": {note: {
      noteId: "current-note",
      video: {media: {stream: {h264: [{masterUrl: "https://sns-video-hw.xhscdn.com/stream/right"}]}}},
    }}}},
  };
  global.fetch = async () => ({
    ok: true,
    headers: {get: name => name === "content-length" ? "4" : ""},
    blob: async () => new Blob(["test"], {type: "video/mp4"}),
  });
  global.FileReader = class {
    readAsDataURL() {
      this.result = "data:video/mp4;base64,dGVzdA==";
      this.onload();
    }
  };
  assert.deepEqual(
    await global.PageNestXhsVideoBridge.resolveInPage(true),
    {
      source_url: "https://sns-video-hw.xhscdn.com/stream/right",
      data_url: "data:video/mp4;base64,dGVzdA==",
    },
    "browser-readable video bytes must be embedded before the service request",
  );

  const capture = {
    page_variant: "xiaohongshu-note",
    media: [{source_url: "blob:https://www.xiaohongshu.com/player"}],
  };
  const scripting = {
    executeScript: async options => {
      assert.equal(options.world, "MAIN");
      assert.deepEqual(options.target, {tabId: 42});
      assert.deepEqual(options.args, [true, "blob:https://www.xiaohongshu.com/player"]);
      return [{result: {
        source_url: "https://sns-video-bd.xhscdn.com/spectrum/direct",
        data_url: "data:video/mp4;base64,AAAA",
      }}];
    },
  };
  await global.PageNestXhsVideoBridge.apply(capture, 42, scripting);
  assert.equal(capture.media[0].source_url, "https://sns-video-bd.xhscdn.com/spectrum/direct");
  assert.equal(capture.media[0].data_url, "data:video/mp4;base64,AAAA");
  assert.equal(capture.media[0].mime_type, "video/mp4");

  const deferred = {
    page_variant: "xiaohongshu-note",
    media: [{source_url: "blob:https://www.xiaohongshu.com/player"}],
  };
  const deferredScripting = {
    executeScript: async options => {
      assert.deepEqual(options.args, [false, "blob:https://www.xiaohongshu.com/player"]);
      return [{result: "https://sns-video-bd.xhscdn.com/spectrum/deferred"}];
    },
  };
  await global.PageNestXhsVideoBridge.apply(deferred, 42, deferredScripting, false);
  assert.equal(deferred.media[0].source_url, "https://sns-video-bd.xhscdn.com/spectrum/deferred");
  assert.equal(deferred.media[0].data_url, undefined, "identification must not download the video bytes");
  console.log("xiaohongshu video bridge tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
