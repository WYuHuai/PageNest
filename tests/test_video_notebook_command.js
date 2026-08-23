const assert = require("node:assert/strict");
const runtime = require("../extension/core/video-notebook-runtime.js");
const capture = require("../extension/core/video-frame-capture.js");

const existingSession = {
  notebook_id: "notebook-1",
  relative_path: "Video Notebooks/Lecture.pagenest",
  source_url: "https://example.test/watch?v=1",
  source_title: "Original lecture",
};
const probe = {
  ok: true,
  current_time: 42.25,
  page_url: "https://example.test/watch?v=1",
  page_title: "<Synthetic lecture>",
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
  const events = [];
  const calls = { appends: 0, creates: 0, sets: 0 };
  let storedSession = Object.hasOwn(overrides, "session") ? overrides.session : existingSession;
  const feedbackApi = { hideTransientUi() {}, renderFeedback() {} };
  const probeApi = { probeVisibleVideo: () => probe };
  const clientApi = overrides.clientApi || {
    connect: async () => { events.push("connect"); return { connection: {}, meta: {} }; },
    appendEntry: async (_connected, actualSession, frame) => {
      calls.appends += 1;
      events.push("save:append");
      assert.deepEqual(actualSession, existingSession);
      assert.equal(frame.video_timestamp_seconds, 42.25);
      return { ...actualSession, entry_count: 2 };
    },
    createNotebook: async (_connected, request) => {
      calls.creates += 1;
      events.push("save:create");
      assert.equal(request.title, overrides.expectedTitle || "<Synthetic lecture>");
      assert.equal(request.source_title, overrides.expectedTitle || "<Synthetic lecture>");
      assert.equal(request.initial_entry.video_timestamp_seconds, 42.25);
      assert.ok(request.initial_entry.image_data_url.startsWith("data:image/png;base64,"));
      return {
        notebook_id: "created-notebook",
        relative_path: "Video Notebooks/Synthetic lecture.pagenest",
        source_url: request.source_url,
        source_title: request.source_title,
        entry_count: 1,
      };
    },
  };
  const sessionApi = overrides.sessionApi || {
    getSession: async () => storedSession,
    setSession: async (value) => {
      calls.sets += 1;
      storedSession = value;
      events.push("session:set");
      return value;
    },
    sourcesMatch: (left, right) => new URL(left).searchParams.get("v") === new URL(right).searchParams.get("v"),
  };
  const chromeApi = overrides.chromeApi || {
    tabs: {
      query: async () => [{ id: 7, windowId: 3, url: overrides.tabUrl || "https://example.test/watch?utm_source=x&v=1#now" }],
      captureVisibleTab: async () => { events.push("capture"); return "data:image/png;base64,AAAA"; },
    },
    scripting: {
      executeScript: async (request) => {
        if (request.func === probeApi.probeVisibleVideo) {
          events.push("probe");
          return [{ result: overrides.probe || probe }];
        }
        if (request.func === feedbackApi.hideTransientUi) {
          events.push("ui:hide");
          return [{ result: true }];
        }
        if (request.func === feedbackApi.renderFeedback) {
          events.push(`ui:${request.args[0].mode}`);
          return [{ result: true }];
        }
        throw new Error("unexpected injected function");
      },
    },
  };
  return {
    options: {
      chromeApi,
      sessionApi,
      probeApi,
      captureApi: overrides.captureApi || capture,
      clientApi,
      feedbackApi,
      cropOptions,
    },
    calls,
    events,
    session: () => storedSession,
  };
}

async function expectCode(run, code) {
  await assert.rejects(run, (error) => error.code === code);
}

(async () => {
  const ignored = harness();
  assert.deepEqual(await runtime.handleCommand("unrelated", ignored.options), { ignored: true });

  const sameVideo = harness();
  const appended = await runtime.handleCommand(runtime.CAPTURE_COMMAND, sameVideo.options);
  assert.equal(appended.ok, true);
  assert.equal(appended.created, false);
  assert.deepEqual(sameVideo.calls, { appends: 1, creates: 0, sets: 0 });
  assert.ok(sameVideo.events.indexOf("ui:hide") < sameVideo.events.indexOf("capture"));
  assert.ok(sameVideo.events.indexOf("save:append") < sameVideo.events.indexOf("ui:saved"));

  const firstCapture = harness({ session: null });
  const created = await runtime.handleCommand(runtime.CAPTURE_COMMAND, firstCapture.options);
  assert.equal(created.created, true);
  assert.deepEqual(firstCapture.calls, { appends: 0, creates: 1, sets: 1 });
  assert.equal(firstCapture.session().notebook_id, "created-notebook");
  assert.equal(firstCapture.session().source_title, "<Synthetic lecture>");
  assert.ok(firstCapture.events.indexOf("capture") < firstCapture.events.indexOf("save:create"));
  assert.ok(firstCapture.events.indexOf("save:create") < firstCapture.events.indexOf("session:set"));
  assert.ok(firstCapture.events.indexOf("session:set") < firstCapture.events.indexOf("ui:started"));

  const newVideo = harness({
    tabUrl: "https://example.test/watch?v=2",
    probe: { ...probe, page_url: "https://example.test/watch?v=2", page_title: "Second video" },
    expectedTitle: "Second video",
  });
  const switched = await runtime.handleCommand(runtime.CAPTURE_COMMAND, newVideo.options);
  assert.equal(switched.created, true);
  assert.equal(newVideo.calls.creates, 1);
  assert.equal(newVideo.calls.appends, 0);

  const noVideo = harness({ session: null, probe: { ok: false, error: "no-visible-video" } });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, noVideo.options), "no-visible-video");
  assert.equal(noVideo.calls.creates, 0);
  assert.equal(noVideo.calls.sets, 0);
  assert.equal(noVideo.events.at(-1), "ui:error");

  const captureFailure = harness({ session: null });
  captureFailure.options.chromeApi.tabs.captureVisibleTab = async () => { throw new Error("denied"); };
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, captureFailure.options), "capture-failed");
  assert.equal(captureFailure.calls.creates, 0);
  assert.equal(captureFailure.calls.sets, 0);

  const hideFailure = harness({ session: null });
  hideFailure.options.chromeApi.scripting.executeScript = async (request) => {
    if (request.func === hideFailure.options.feedbackApi.hideTransientUi) {
      throw new Error("injection denied");
    }
    throw new Error("capture must stop before probing");
  };
  await expectCode(
    () => runtime.handleCommand(runtime.CAPTURE_COMMAND, hideFailure.options),
    "video-frame-not-supported"
  );
  assert.equal(hideFailure.events.includes("capture"), false);
  assert.equal(hideFailure.calls.creates, 0);

  const cropFailure = harness({
    session: null,
    captureApi: { cropScreenshot: async () => { const error = new Error(); error.code = "crop-failed"; throw error; } },
  });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, cropFailure.options), "crop-failed");
  assert.equal(cropFailure.calls.creates, 0);
  assert.equal(cropFailure.calls.sets, 0);

  const oldSession = { ...existingSession };
  const createFailure = harness({
    tabUrl: "https://example.test/watch?v=2",
    probe: { ...probe, page_url: "https://example.test/watch?v=2", page_title: "Second video" },
    clientApi: {
      connect: async () => ({}),
      createNotebook: async () => { const error = new Error("write failed"); error.code = "create-failed"; throw error; },
      appendEntry: async () => { throw new Error("unexpected append"); },
    },
  });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, createFailure.options), "create-failed");
  assert.deepEqual(createFailure.session(), oldSession);
  assert.equal(createFailure.calls.sets, 0);

  const navigated = harness({ probe: { ...probe, page_url: "https://example.test/watch?v=2" } });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, navigated.options), "video-page-changed");
  assert.equal(navigated.calls.creates, 0);
  assert.equal(navigated.calls.appends, 0);

  const renameEvents = [];
  let updatedSession;
  const renamed = await runtime.renameNotebook("notebook-1", "Renamed", {
    sessionApi: {
      getSession: async () => existingSession,
      setSession: async (value) => { updatedSession = value; renameEvents.push("set"); return value; },
    },
    clientApi: {
      connect: async () => ({}),
      renameNotebook: async (_connected, session, title) => {
        renameEvents.push("rename");
        assert.deepEqual(session, existingSession);
        assert.equal(title, "Renamed");
        return { ...session, title, relative_path: "Video Notebooks/Renamed.pagenest" };
      },
    },
  });
  assert.deepEqual(renameEvents, ["rename", "set"]);
  assert.equal(renamed.relative_path, "Video Notebooks/Renamed.pagenest");
  assert.equal(updatedSession.source_url, existingSession.source_url);
  assert.equal(updatedSession.source_title, existingSession.source_title);

  let renameSet = false;
  await expectCode(
    () => runtime.renameNotebook("notebook-1", "Broken", {
      sessionApi: { getSession: async () => existingSession, setSession: async () => { renameSet = true; } },
      clientApi: {
        connect: async () => ({}),
        renameNotebook: async () => { const error = new Error(); error.code = "rename-failed"; throw error; },
      },
    }),
    "rename-failed"
  );
  assert.equal(renameSet, false);

  console.log("video notebook command tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
