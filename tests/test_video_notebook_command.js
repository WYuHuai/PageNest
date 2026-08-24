const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../extension/core/video-notebook-runtime.js");
const capture = require("../extension/core/video-frame-capture.js");

const runtimeSource = fs.readFileSync(
  path.join(__dirname, "..", "extension", "core", "video-notebook-runtime.js"),
  "utf8"
);
assert.equal(runtimeSource.includes("captureVisibleTab"), false);

const existingSession = {
  notebook_id: "notebook-1",
  relative_path: "Video Notebooks/Lecture.pagenest",
  source_url: "https://example.test/watch?v=1",
  source_title: "Original lecture",
};
const probe = {
  ok: true,
  video_index: 0,
  current_time: 42.25,
  page_url: "https://example.test/watch?v=1",
  page_title: "<Synthetic lecture>",
  viewport_width: 1000,
  viewport_height: 800,
  rect: { left: 100, top: 50, right: 700, bottom: 450, width: 600, height: 400 },
};
const directFrame = {
  ok: true,
  current_time: 42.25,
  page_url: "https://example.test/watch?v=1",
  image_data_url: "data:image/webp;base64,UklGRgAAAABXRUJQ",
  mime_type: "image/webp",
  size: 12,
  source_width: 1920,
  source_height: 1080,
  output_width: 1920,
  output_height: 1080,
};

function harness(overrides = {}) {
  const events = [];
  const calls = { appends: 0, creates: 0, analyzes: 0, sets: 0 };
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
      assert.equal(frame.request_analysis, true);
      return { ...actualSession, entry_id: "appended-entry", entry_count: 2 };
    },
    createNotebook: async (_connected, request) => {
      calls.creates += 1;
      events.push("save:create");
      assert.equal(request.title, overrides.expectedTitle || "<Synthetic lecture>");
      assert.equal(request.source_title, overrides.expectedTitle || "<Synthetic lecture>");
      assert.equal(request.initial_entry.video_timestamp_seconds, 42.25);
      assert.ok(request.initial_entry.image_data_url.startsWith("data:image/webp;base64,"));
      assert.equal(request.initial_entry.request_analysis, true);
      return {
        notebook_id: "created-notebook",
        relative_path: "Video Notebooks/Synthetic lecture.pagenest",
        source_url: request.source_url,
        source_title: request.source_title,
        entry_count: 1,
        entry_id: "created-entry",
      };
    },
    analyzeEntry: async (_connected, session, entryId) => {
      calls.analyzes += 1;
      events.push(`analyze:${entryId}`);
      assert.ok(session.notebook_id);
      return { status: "complete" };
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
    },
    scripting: {
      executeScript: async (request) => {
        if (request.func === probeApi.probeVisibleVideo) {
          events.push("probe");
          return [{ result: overrides.probe || probe }];
        }
        if (request.func === (overrides.captureApi || capture).captureVideoFrame) {
          events.push("capture:frame");
          assert.deepEqual(request.target, { tabId: 7 });
          assert.equal(Object.hasOwn(request.target, "allFrames"), false);
          assert.deepEqual(Object.keys(request.args[0]).sort(), [
            "expected_page_url",
            "max_dimension",
            "max_frame_bytes",
            "mime_type",
            "quality",
            "timeout_ms",
            "video_index",
          ]);
          const activeProbe = overrides.probe || probe;
          return [{ result: overrides.frameResult || {
            ...directFrame,
            current_time: activeProbe.current_time,
            page_url: activeProbe.page_url,
          } }];
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
  assert.deepEqual(sameVideo.calls, { appends: 1, creates: 0, analyzes: 1, sets: 0 });
  assert.ok(sameVideo.events.indexOf("ui:hide") < sameVideo.events.indexOf("capture:frame"));
  assert.ok(sameVideo.events.indexOf("save:append") < sameVideo.events.indexOf("ui:saved"));
  assert.ok(sameVideo.events.indexOf("ui:saved") < sameVideo.events.indexOf("analyze:appended-entry"));

  const firstCapture = harness({ session: null });
  const created = await runtime.handleCommand(runtime.CAPTURE_COMMAND, firstCapture.options);
  assert.equal(created.created, true);
  assert.deepEqual(firstCapture.calls, { appends: 0, creates: 1, analyzes: 1, sets: 1 });
  assert.equal(firstCapture.session().notebook_id, "created-notebook");
  assert.equal(firstCapture.session().source_title, "<Synthetic lecture>");
  assert.ok(firstCapture.events.indexOf("capture:frame") < firstCapture.events.indexOf("save:create"));
  assert.ok(firstCapture.events.indexOf("save:create") < firstCapture.events.indexOf("session:set"));
  assert.ok(firstCapture.events.indexOf("session:set") < firstCapture.events.indexOf("ui:started"));
  assert.ok(firstCapture.events.indexOf("ui:started") < firstCapture.events.indexOf("analyze:created-entry"));

  const newVideo = harness({
    tabUrl: "https://example.test/watch?v=2",
    probe: { ...probe, page_url: "https://example.test/watch?v=2", page_title: "Second video" },
    expectedTitle: "Second video",
  });
  const switched = await runtime.handleCommand(runtime.CAPTURE_COMMAND, newVideo.options);
  assert.equal(switched.created, true);
  assert.equal(newVideo.calls.creates, 1);
  assert.equal(newVideo.calls.appends, 0);

  let resolveAnalysis;
  const delayed = harness({
    clientApi: {
      connect: async () => ({}),
      appendEntry: async () => ({ ...existingSession, entry_id: "delayed-entry" }),
      createNotebook: async () => { throw new Error("unexpected create"); },
      analyzeEntry: async () => new Promise((resolve) => { resolveAnalysis = resolve; }),
    },
  });
  const delayedRun = runtime.handleCommand(runtime.CAPTURE_COMMAND, delayed.options);
  while (!resolveAnalysis) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(delayed.events.includes("ui:saved"));
  resolveAnalysis({ status: "complete" });
  await delayedRun;

  const aiFailure = harness({
    clientApi: {
      connect: async () => ({}),
      appendEntry: async () => ({ ...existingSession, entry_id: "saved-entry" }),
      createNotebook: async () => { throw new Error("unexpected create"); },
      analyzeEntry: async () => { const error = new Error("AI down"); error.code = "analyze-failed"; throw error; },
    },
  });
  const stillSaved = await runtime.handleCommand(runtime.CAPTURE_COMMAND, aiFailure.options);
  assert.equal(stillSaved.ok, true);
  assert.equal(stillSaved.analysis.status, "failed");

  const noVideo = harness({ session: null, probe: { ok: false, error: "no-visible-video" } });
  await expectCode(() => runtime.handleCommand(runtime.CAPTURE_COMMAND, noVideo.options), "no-visible-video");
  assert.equal(noVideo.calls.creates, 0);
  assert.equal(noVideo.calls.analyzes, 0);
  assert.equal(noVideo.calls.sets, 0);
  assert.equal(noVideo.events.at(-1), "ui:error");

  const captureFailure = harness({
    session: null,
    frameResult: { ok: false, error: "video-frame-capture-unsupported" },
  });
  await expectCode(
    () => runtime.handleCommand(runtime.CAPTURE_COMMAND, captureFailure.options),
    "video-frame-capture-unsupported"
  );
  assert.equal(captureFailure.calls.creates, 0);
  assert.equal(captureFailure.calls.analyzes, 0);
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
  assert.equal(hideFailure.events.includes("capture:frame"), false);
  assert.equal(hideFailure.calls.creates, 0);

  const frameInjectionFailure = harness({
    session: null,
  });
  const originalExecute = frameInjectionFailure.options.chromeApi.scripting.executeScript;
  frameInjectionFailure.options.chromeApi.scripting.executeScript = async (request) => {
    if (request.func === capture.captureVideoFrame) throw new Error("renderer rejected injection");
    return originalExecute(request);
  };
  await expectCode(
    () => runtime.handleCommand(runtime.CAPTURE_COMMAND, frameInjectionFailure.options),
    "video-frame-capture-unsupported"
  );
  assert.equal(frameInjectionFailure.calls.creates, 0);
  assert.equal(frameInjectionFailure.calls.sets, 0);

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

  let analyzeAfterSaveFailure = 0;
  const appendFailure = harness({
    clientApi: {
      connect: async () => ({}),
      appendEntry: async () => { const error = new Error("write failed"); error.code = "append-failed"; throw error; },
      createNotebook: async () => { throw new Error("unexpected create"); },
      analyzeEntry: async () => { analyzeAfterSaveFailure += 1; },
    },
  });
  await expectCode(
    () => runtime.handleCommand(runtime.CAPTURE_COMMAND, appendFailure.options),
    "append-failed"
  );
  assert.equal(analyzeAfterSaveFailure, 0);

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
