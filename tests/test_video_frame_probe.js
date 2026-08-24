const assert = require("node:assert/strict");
const vm = require("node:vm");
const { probeVisibleVideo } = require("../extension/core/video-frame-probe.js");

function video(rect, options = {}) {
  return {
    nodeType: 1,
    parentElement: options.parent || null,
    isConnected: options.isConnected ?? true,
    paused: options.paused ?? true,
    ended: options.ended ?? false,
    currentTime: options.currentTime ?? 0,
    style: options.style || { display: "block", visibility: "visible", opacity: "1" },
    getBoundingClientRect: () => ({
      ...rect,
      right: rect.right ?? rect.left + rect.width,
      bottom: rect.bottom ?? rect.top + rect.height,
    }),
  };
}

function probe(videos, options = {}) {
  const metadata = options.metadata || {};
  const document = {
    title: "Synthetic video",
    documentElement: { clientWidth: 1000, clientHeight: 800 },
    querySelectorAll: () => videos,
    querySelector: (selector) => metadata[selector] || null,
  };
  const window = {
    innerWidth: 1000,
    innerHeight: 800,
    devicePixelRatio: 1.25,
    location: { href: "https://example.test/watch?id=1" },
    getComputedStyle: (element) => element.style,
  };
  return probeVisibleVideo({ document, window, ...options, metadata: undefined });
}

const single = probe([video({ left: 100, top: 80, width: 640, height: 360 }, { currentTime: 12.5 })]);
assert.equal(single.ok, true);
assert.equal(single.video_index, 0);
assert.equal(single.current_time, 12.5);
assert.deepEqual(single.rect, { left: 100, top: 80, right: 740, bottom: 440, width: 640, height: 360 });
assert.equal(single.viewport_width, 1000);
assert.equal(single.viewport_height, 800);
assert.equal(single.device_pixel_ratio, 1.25);
assert.equal(single.page_title, "Synthetic video");

const titled = probe(
  [video({ left: 0, top: 0, width: 800, height: 450 })],
  {
    metadata: {
      'meta[property="og:title"]': { content: "  Open Graph 标题  " },
      'meta[name="twitter:title"]': { content: "Twitter 标题" },
      "main h1": { textContent: "页面主标题" },
    },
  }
);
assert.equal(titled.page_title, "Open Graph 标题");

const twitterTitle = probe(
  [video({ left: 0, top: 0, width: 800, height: 450 })],
  { metadata: { 'meta[name="twitter:title"]': { content: "Twitter 标题" } } }
);
assert.equal(twitterTitle.page_title, "Twitter 标题");

const mainTitle = probe(
  [video({ left: 0, top: 0, width: 800, height: 450 })],
  { metadata: { "main h1": { textContent: "可靠主标题" } } }
);
assert.equal(mainTitle.page_title, "可靠主标题");

const serializedProbe = vm.runInNewContext(`(${probeVisibleVideo.toString()})`);
assert.equal(
  serializedProbe({
    document: {
      title: "Serialized fallback",
      documentElement: { clientWidth: 1000, clientHeight: 800 },
      querySelectorAll: () => [video({ left: 0, top: 0, width: 800, height: 450 })],
      querySelector: (selector) => selector === 'meta[property="og:title"]'
        ? { content: "Serialized OG title" }
        : null,
    },
    window: {
      innerWidth: 1000,
      innerHeight: 800,
      location: { href: "https://example.test/serialized" },
      getComputedStyle: (element) => element.style,
    },
  }).page_title,
  "Serialized OG title"
);

for (const hidden of [
  video({ left: 0, top: 0, width: 600, height: 400 }, { style: { display: "none" } }),
  video({ left: 0, top: 0, width: 600, height: 400 }, { style: { visibility: "hidden" } }),
  video({ left: 0, top: 0, width: 600, height: 400 }, { style: { opacity: "0" } }),
  video({ left: 0, top: 0, width: 0, height: 0 }),
]) {
  assert.equal(probe([hidden]).error, "no-visible-video");
}

const hiddenParent = { nodeType: 1, parentElement: null, style: { display: "none" } };
assert.equal(
  probe([video({ left: 0, top: 0, width: 600, height: 400 }, { parent: hiddenParent })]).error,
  "no-visible-video"
);

const advertisement = video({ left: 10, top: 10, width: 220, height: 120 }, { paused: false });
const main = video({ left: 100, top: 100, width: 720, height: 405 }, { currentTime: 55 });
assert.equal(probe([advertisement, main]).current_time, 55);
assert.equal(probe([advertisement, main]).video_index, 1);

const comparablePaused = video({ left: 0, top: 0, width: 650, height: 360 }, { currentTime: 1 });
const comparablePlaying = video(
  { left: 0, top: 0, width: 620, height: 350 },
  { paused: false, currentTime: 2 }
);
assert.equal(probe([comparablePaused, comparablePlaying]).current_time, 2);

const partial = probe([video({ left: -200, top: 100, width: 600, height: 400 })]);
assert.equal(partial.ok, true);
assert.deepEqual(partial.rect, { left: 0, top: 100, right: 400, bottom: 500, width: 400, height: 400 });
assert.ok(Math.abs(partial.visible_ratio - 2 / 3) < 1e-9);

const insufficient = probe([video({ left: -500, top: 100, width: 600, height: 400 })]);
assert.equal(insufficient.error, "video-not-sufficiently-visible");
assert.equal(probe([]).error, "no-visible-video");

console.log("video frame probe tests passed");
