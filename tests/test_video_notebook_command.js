const assert = require("node:assert/strict");
const runtime = require("../extension/core/video-notebook-runtime.js");
const capture = require("../extension/core/video-frame-capture.js");

const session = {
  notebook_id: "notebook-1",
  relative_path: "Video Notebooks/Lecture.pagenest",
  source_url: "https://example.test/watch?v=1",
  source_title: "Lecture",
};
const probe = {
  ok: true,
  current_time: 42.25,
  page_url: "https://example.test/watch?v=1",
  page_title: "Synthetic lecture",
  viewport_width: 1000,
  viewport_height: 800,
  rect: { left: 100, top: 50, right: 700, bottom: 450, width: 600, height: 400 },
};
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
class Canvas {
  getContext() { return { drawImage() {} }; }
  async convertToBlob() { return new Blob([pngBytes], { type: "image/png" }); }
}
const cropOptions = {
  fetch: async () => ({ blob: async () => new Blob(["source"]) }),
  createImageBitmap: async () => ({ width: 2000, height: 1600, close() {} }),
  OffscreenCanvas: Canvas,
  btoa: (binary) => Buffer.from(binary, "binary").toString("base64"),
};

function harness(overrides = {}) {
  let appends = 0;
  const clientApi = overrides.clientApi || {
    connect: async () => ({ connection: {}, meta: {} }),
    appendEntry: async (_connected, actualSession, frame) => {
      appends += 1;
      assert.deepEqual(actualSession, session);
      assert.equal(frame.video_timestamp_seconds, 42.25);
      assert.ok(frame.image_data_url.startsWith("data:image/png;base64,"));
      return { entry_count: 1 };
    },
  };
  const chromeApi = overrides.chromeApi || {
    tabs: {
      query: async () => [{ id: 7, windowId: 3, url: "https://example.test/watch?utm_source=x&v=1#now" }],
      captureVisibleTab: async () => "data:image/png;base64,AAAA",
    },
    scripting: { executeScript: async () => [{ result: probe }] },
  };
  return {
    options: {
      chromeApi,
      sessionApi: overrides.sessionApi || {
        getSession: async () => session,
        sourcesMatch: (left, right) => new URL(left).searchParams.get("v") === new URL(right).searchParams.get("v"),
      },
      probeApi: { probeVisibleVideo: () => probe },
      captureApi: overrides.captureApi || capture,
      clientApi,
      cropOptions,
    },
    appends: () => appends,
  };
}

async function expectCode(run, code) {
  await assert.rejects(run, (error) => error.code === code);
}

(async () => {
  const ignored = harness();
  assert.deepEqual(await runtime.handleCommand("unrelated", ignored.options), { ignored: true });
  assert.equal(ignored.appends(), 0);

  const success = harness();
  const result = await runtime.handleCommand(runtime.CAPTURE_COMMAND, success.options);
  assert.equal(result.ok, true);
  assert.equal(success.appends(), 1);
  assert.equal(result.crop.scale_x, 2);
  assert.equal(result.crop.scale_y, 2);

  const noSession = harness({ sessionApi: { getSession: async () => null } });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, noSession.options), "no-active-notebook");

  const unavailable = harness({
    clientApi: { connect: async () => { const error = new Error(); error.code = "service-unavailable"; throw error; } },
  });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, unavailable.options), "service-unavailable");

  const unsupported = harness({
    clientApi: { connect: async () => { const error = new Error(); error.code = "unsupported-service-capability"; throw error; } },
  });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, unsupported.options), "unsupported-service-capability");

  const noTab = harness({ chromeApi: { tabs: { query: async () => [] }, scripting: {} } });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, noTab.options), "no-active-tab");

  const mismatch = harness();
  mismatch.options.sessionApi.sourcesMatch = () => false;
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, mismatch.options), "notebook-source-mismatch");

  const noVideo = harness();
  noVideo.options.chromeApi.scripting.executeScript = async () => [{ result: { ok: false, error: "no-visible-video" } }];
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, noVideo.options), "no-visible-video");

  const navigated = harness();
  navigated.options.chromeApi.scripting.executeScript = async () => [{
    result: { ...probe, page_url: "https://example.test/watch?v=2" },
  }];
  await expectCode(
    () => runtime.handleCommand(runtime.CAPTURE_COMMAND, navigated.options),
    "notebook-source-mismatch"
  );

  const captureFailure = harness();
  captureFailure.options.chromeApi.tabs.captureVisibleTab = async () => { throw new Error("denied"); };
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, captureFailure.options), "capture-failed");

  const cropFailure = harness({
    captureApi: { cropScreenshot: async () => { const error = new Error(); error.code = "crop-failed"; throw error; } },
  });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, cropFailure.options), "crop-failed");

  const appendFailure = harness({
    clientApi: {
      connect: async () => ({}),
      appendEntry: async () => { const error = new Error(); error.code = "append-failed"; throw error; },
    },
  });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, appendFailure.options), "append-failed");

  assert.equal(typeof runtime.handleCommand, "function");
  console.log("video notebook command tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
