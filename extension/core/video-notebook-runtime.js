(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoNotebookRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CAPTURE_COMMAND = "capture-video-notebook-frame";
  let registered = false;

  class RuntimeError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "RuntimeError";
      this.code = code;
    }
  }

  function controlled(error, fallbackCode, fallbackMessage) {
    if (error?.code) return error;
    return new RuntimeError(fallbackCode, fallbackMessage);
  }

  async function captureNotebookFrame(options = {}) {
    const chromeApi = options.chromeApi || root.chrome;
    const sessionApi = options.sessionApi || root.PageNestVideoNotebookSession;
    const probeApi = options.probeApi || root.PageNestVideoFrameProbe;
    const captureApi = options.captureApi || root.PageNestVideoFrameCapture;
    const clientApi = options.clientApi || root.PageNestNotebookClient;
    const session = await sessionApi.getSession(options.sessionOptions);
    if (!session) throw new RuntimeError("no-active-notebook", "No active Video Notebook session");

    let connected;
    try {
      connected = await clientApi.connect(options.clientOptions);
    } catch (error) {
      throw controlled(error, "service-unavailable", "PageNest Service is unavailable");
    }
    const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    if (!tab?.id || !tab.url) throw new RuntimeError("no-active-tab", "No active browser tab");
    if (!sessionApi.sourcesMatch(session.source_url, tab.url)) {
      throw new RuntimeError("notebook-source-mismatch", "Active tab does not match the Notebook source");
    }

    let probe;
    try {
      const results = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        func: probeApi.probeVisibleVideo,
        args: [{ minimum_visible_ratio: 0.5 }],
      });
      probe = results?.[0]?.result;
    } catch {
      throw new RuntimeError("video-frame-not-supported", "Unable to inspect video in the active tab");
    }
    if (!probe?.ok) {
      throw new RuntimeError(probe?.error || "no-visible-video", "No suitable visible video was found");
    }
    if (!sessionApi.sourcesMatch(session.source_url, probe.page_url)) {
      throw new RuntimeError("notebook-source-mismatch", "Video page changed during capture");
    }

    let screenshot;
    try {
      screenshot = await chromeApi.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    } catch {
      throw new RuntimeError("capture-failed", "Unable to capture the visible tab");
    }
    let cropped;
    try {
      cropped = await captureApi.cropScreenshot(screenshot, probe, options.cropOptions);
    } catch (error) {
      throw controlled(error, "crop-failed", "Unable to crop the visible video frame");
    }
    try {
      const result = await clientApi.appendEntry(connected, session, {
        video_timestamp_seconds: probe.current_time,
        image_data_url: cropped.image_data_url,
      });
      return { ok: true, result, probe, crop: cropped.crop };
    } catch (error) {
      throw controlled(error, "append-failed", "Unable to append the video frame");
    }
  }

  async function handleCommand(command, options = {}) {
    if (command !== CAPTURE_COMMAND) return { ignored: true };
    return captureNotebookFrame(options);
  }

  function registerCommandListener(chromeApi = root.chrome) {
    if (registered) return;
    registered = true;
    chromeApi.commands.onCommand.addListener((command) => {
      handleCommand(command, { chromeApi }).catch((error) => {
        console.warn(`PageNest video frame capture failed: ${error?.code || "unknown"}`);
      });
    });
  }

  return Object.freeze({
    CAPTURE_COMMAND,
    RuntimeError,
    captureNotebookFrame,
    handleCommand,
    registerCommandListener,
  });
});
