const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  DEFAULT_FRAME_MIME_TYPE,
  DEFAULT_FRAME_QUALITY,
  FRAME_READY_TIMEOUT_MS,
  MAX_FRAME_BYTES,
  MAX_VIDEO_FRAME_DIMENSION,
  captureVideoFrame,
  fitFrameDimensions,
} = require("../extension/core/video-frame-capture.js");

const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

assert.deepEqual(fitFrameDimensions(1920, 1080, 1920), { width: 1920, height: 1080 });
assert.deepEqual(fitFrameDimensions(3840, 2160, 1920), { width: 1920, height: 1080 });
assert.deepEqual(fitFrameDimensions(2160, 3840, 1920), { width: 1080, height: 1920 });
assert.throws(
  () => fitFrameDimensions(0, 1080, 1920),
  (error) => error.code === "video-frame-not-ready"
);

class Reader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend();
    }, (error) => this.onerror(error));
  }
}

function video(overrides = {}) {
  const listeners = new Map();
  const value = {
    isConnected: true,
    readyState: 4,
    videoWidth: 1920,
    videoHeight: 1080,
    currentTime: 12.5,
    paused: true,
    ended: false,
    seeking: false,
    error: null,
    mediaKeys: null,
    addEventListener(name, handler) {
      const handlers = listeners.get(name) || new Set();
      handlers.add(handler);
      listeners.set(name, handlers);
    },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    dispatch(name) { for (const handler of listeners.get(name) || []) handler(); },
    listenerCount() {
      return [...listeners.values()].reduce((total, handlers) => total + handlers.size, 0);
    },
    ...overrides,
  };
  return value;
}

function environment(targetVideo, overrides = {}) {
  const state = { canvases: [], draws: [], frameCallbacks: 0, canceledCallbacks: 0 };
  class Canvas {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.released = false;
      state.canvases.push(this);
    }
    getContext() {
      return {
        drawImage: (...args) => {
          state.draws.push(args);
          if (overrides.drawError) throw overrides.drawError;
        },
      };
    }
    toBlob(callback, type, quality) {
      state.mimeType = type;
      state.quality = quality;
      if (overrides.encodeError) throw overrides.encodeError;
      const blob = overrides.blob || new Blob([WEBP_BYTES], { type: "image/webp" });
      setImmediate(() => callback(blob));
    }
  }
  const originalWidth = Object.getOwnPropertyDescriptor(Canvas.prototype, "width");
  void originalWidth;
  const document = {
    querySelectorAll: () => [targetVideo],
    createElement: (name) => {
      assert.equal(name, "canvas");
      const canvas = new Canvas();
      let width = 0;
      let height = 0;
      Object.defineProperties(canvas, {
        width: {
          get: () => width,
          set: (value) => { width = value; if (value === 1 && height === 1) canvas.released = true; },
        },
        height: {
          get: () => height,
          set: (value) => { height = value; if (value === 1 && width === 1) canvas.released = true; },
        },
      });
      return canvas;
    },
  };
  if (overrides.frameCallback !== false) {
    targetVideo.requestVideoFrameCallback = (callback) => {
      state.frameCallbacks += 1;
      if (!overrides.frameCallbackTimeout) setImmediate(() => callback(1, { mediaTime: targetVideo.currentTime }));
      return 9;
    };
    targetVideo.cancelVideoFrameCallback = () => { state.canceledCallbacks += 1; };
  }
  return {
    state,
    request: {
      video_index: 0,
      expected_page_url: "https://example.test/watch",
      max_dimension: MAX_VIDEO_FRAME_DIMENSION,
      max_frame_bytes: MAX_FRAME_BYTES,
      mime_type: DEFAULT_FRAME_MIME_TYPE,
      quality: DEFAULT_FRAME_QUALITY,
      timeout_ms: overrides.timeoutMs || FRAME_READY_TIMEOUT_MS,
      test_document: document,
      test_location: { href: "https://example.test/watch" },
      test_FileReader: Reader,
    },
  };
}

async function capture(targetVideo, overrides = {}) {
  const fixture = environment(targetVideo, overrides);
  const result = await captureVideoFrame(fixture.request);
  return { result, ...fixture };
}

(async () => {
  const paused = await capture(video());
  assert.equal(paused.result.ok, true);
  assert.equal(paused.result.current_time, 12.5);
  assert.equal(paused.result.mime_type, "image/webp");
  assert.equal(paused.result.output_width, 1920);
  assert.equal(paused.result.output_height, 1080);
  assert.equal(paused.state.frameCallbacks, 0);
  assert.equal(paused.state.draws.length, 1);
  assert.equal(paused.state.canvases[0].released, true);

  const playingVideo = video({ paused: false, currentTime: 20 });
  const playing = await capture(playingVideo);
  assert.equal(playing.result.ok, true);
  assert.equal(playing.state.frameCallbacks, 1);
  assert.equal(playing.result.frame_sync, "video-frame-callback");

  const noCallback = await capture(video({ paused: false }), { frameCallback: false });
  assert.equal(noCallback.result.ok, true);
  assert.equal(noCallback.result.frame_sync, "ready-state");

  const loadingVideo = video({ readyState: 1, videoWidth: 0, videoHeight: 0 });
  setImmediate(() => {
    loadingVideo.readyState = 4;
    loadingVideo.videoWidth = 1280;
    loadingVideo.videoHeight = 720;
    loadingVideo.dispatch("loadeddata");
  });
  const loaded = await capture(loadingVideo);
  assert.equal(loaded.result.ok, true);
  assert.equal(loaded.result.source_width, 1280);
  assert.equal(loadingVideo.listenerCount(), 0);

  const seekingVideo = video({ seeking: true, paused: true, currentTime: 40 });
  setImmediate(() => { seekingVideo.seeking = false; seekingVideo.currentTime = 41; seekingVideo.dispatch("seeked"); });
  const sought = await capture(seekingVideo);
  assert.equal(sought.result.ok, true);
  assert.equal(sought.result.current_time, 41);

  const callbackTimeout = await capture(video({ paused: false }), {
    frameCallbackTimeout: true,
    timeoutMs: 10,
  });
  assert.deepEqual(callbackTimeout.result, {
    ok: false,
    error: "video-frame-capture-timeout",
    reason: "frame-callback-timeout",
  });
  assert.equal(callbackTimeout.state.canceledCallbacks, 1);

  const neverReady = await capture(video({ readyState: 0, videoWidth: 0, videoHeight: 0 }), {
    timeoutMs: 10,
  });
  assert.equal(neverReady.result.error, "video-frame-not-ready");

  const tainted = await capture(video(), {
    drawError: Object.assign(new Error("tainted"), { name: "SecurityError" }),
  });
  assert.deepEqual(tainted.result, {
    ok: false,
    error: "video-frame-capture-unsupported",
    reason: "canvas-security",
  });

  const exportTainted = await capture(video(), {
    encodeError: Object.assign(new Error("tainted export"), { name: "SecurityError" }),
  });
  assert.deepEqual(exportTainted.result, {
    ok: false,
    error: "video-frame-capture-unsupported",
    reason: "canvas-security",
  });

  const protectedMedia = await capture(video({ mediaKeys: {} }));
  assert.deepEqual(protectedMedia.result, {
    ok: false,
    error: "video-frame-capture-unsupported",
    reason: "protected-media",
  });

  const decodeFailure = await capture(video({ error: { code: 3 } }));
  assert.deepEqual(decodeFailure.result, {
    ok: false,
    error: "video-frame-capture-unsupported",
    reason: "decode-error",
  });

  const oversized = await capture(video(), {
    blob: { type: "image/webp", size: MAX_FRAME_BYTES + 1 },
  });
  assert.equal(oversized.result.error, "screenshot-too-large");

  const invalidMime = await capture(video(), {
    blob: new Blob([WEBP_BYTES], { type: "application/octet-stream" }),
  });
  assert.equal(invalidMime.result.error, "video-frame-capture-unsupported");
  assert.equal(invalidMime.result.reason, "invalid-raster");

  const overlay = { textContent: "player title progress controls toast subtitle cursor" };
  const cleanVideo = video({ paused: true });
  const cleanFixture = environment(cleanVideo);
  cleanFixture.request.test_document.querySelectorAll = (selector) => selector === "video"
    ? [cleanVideo]
    : [overlay];
  const clean = await captureVideoFrame(cleanFixture.request);
  assert.equal(clean.ok, true);
  assert.equal(cleanFixture.state.draws[0][0], cleanVideo);
  assert.equal(cleanFixture.state.draws[0].includes(overlay), false);

  const scaled = await capture(video({ videoWidth: 3840, videoHeight: 2160 }));
  assert.equal(scaled.result.output_width, 1920);
  assert.equal(scaled.result.output_height, 1080);

  const displayIndependentFixture = environment(video({ videoWidth: 1280, videoHeight: 720 }));
  Object.assign(displayIndependentFixture.request, {
    viewport_width: 500,
    viewport_height: 300,
    device_pixel_ratio: 3,
    browser_zoom: 2,
    rect: { width: 500, height: 281 },
  });
  const displayIndependent = await captureVideoFrame(displayIndependentFixture.request);
  assert.equal(displayIndependent.output_width, 1280);
  assert.equal(displayIndependent.output_height, 720);

  for (const transport of ["blob:https://example.test/mse", "https://cdn.example.test/live.m3u8"]) {
    const decoded = await capture(video({ src: transport }));
    assert.equal(decoded.result.ok, true);
  }

  const serialized = vm.runInNewContext(`(${captureVideoFrame.toString()})`);
  assert.equal(typeof serialized, "function");

  const source = fs.readFileSync(
    path.join(__dirname, "..", "extension", "core", "video-frame-capture.js"),
    "utf8"
  );
  for (const forbidden of [
    "captureVisibleTab",
    "tabCapture",
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "document.cookie",
    "localStorage",
    "service_token",
    "api_key",
    "devicePixelRatio",
    "getBoundingClientRect",
    "innerWidth",
    "innerHeight",
  ]) assert.equal(source.includes(forbidden), false, `forbidden frame capture capability: ${forbidden}`);

  const started = performance.now();
  let totalBytes = 0;
  for (let index = 0; index < 10; index += 1) {
    const run = await capture(video({ videoWidth: 1920, videoHeight: 1080 }));
    assert.equal(run.result.ok, true);
    assert.equal(run.state.canvases.every((canvas) => canvas.released), true);
    totalBytes += run.result.size;
  }
  const elapsed = performance.now() - started;
  assert.equal(totalBytes, WEBP_BYTES.length * 10);
  console.log(JSON.stringify({ synthetic_captures: 10, dimensions: "1920x1080", total_bytes: totalBytes, elapsed_ms: Number(elapsed.toFixed(3)) }));
  console.log("video frame capture tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
