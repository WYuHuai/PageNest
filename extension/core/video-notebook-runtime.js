(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestVideoNotebookRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CAPTURE_COMMAND = "capture-video-notebook-frame";
  const ERROR_MESSAGES = Object.freeze({
    "no-active-tab": "当前没有可截图的网页。",
    "no-visible-video": "没有找到清晰可见的主视频。",
    "video-not-sufficiently-visible": "请让视频大部分显示在窗口中后重试。",
    "video-frame-not-supported": "当前页面不支持视频截图。",
    "video-page-changed": "页面在截图过程中发生了变化，请重试。",
    "video-frame-not-ready": "视频画面尚未准备好，请稍后重试。",
    "video-frame-capture-timeout": "等待稳定视频帧超时，请重试。",
    "video-frame-capture-unsupported": "当前视频无法安全读取画面，未创建空笔记。",
    "screenshot-too-large": "截图超过 10 MiB 限制。",
    "service-unavailable": "PageNest Service 当前不可用。",
    "unsupported-service-capability": "PageNest Service 尚不支持视频笔记。",
    "create-failed": "无法创建视频笔记，原有笔记没有改变。",
    "append-failed": "截图未能保存，请稍后重试。",
    "rename-failed": "标题保存失败，截图和原笔记仍然保留。",
  });
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

  function timestampLabel(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    const short = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    return hours ? `${String(hours).padStart(2, "0")}:${short}` : short;
  }

  async function inject(chromeApi, tabId, func, args = []) {
    if (!func) return false;
    try {
      await chromeApi.scripting.executeScript({ target: { tabId }, func, args });
      return true;
    } catch {
      return false;
    }
  }

  async function showFeedback(chromeApi, feedbackApi, tabId, payload) {
    await inject(chromeApi, tabId, feedbackApi?.renderFeedback, [payload]);
  }

  function feedbackPayload(mode, details = {}) {
    const protocol = root.PageNestRuntimeProtocol;
    return {
      mode,
      ...details,
      namespace: protocol?.NAMESPACE || "pagenest.extension.runtime",
      protocol_version: protocol?.VERSION || 1,
      rename_type: protocol?.RENAME_VIDEO_NOTEBOOK || "RENAME_VIDEO_NOTEBOOK",
    };
  }

  async function analyzeSavedFrame(clientApi, connected, session, entryId) {
    if (!entryId || typeof clientApi?.analyzeEntry !== "function") {
      return { status: "failed" };
    }
    try {
      return await clientApi.analyzeEntry(connected, session, entryId);
    } catch {
      return { status: "failed" };
    }
  }

  async function captureNotebookFrame(options = {}) {
    const chromeApi = options.chromeApi || root.chrome;
    const sessionApi = options.sessionApi || root.PageNestVideoNotebookSession;
    const probeApi = options.probeApi || root.PageNestVideoFrameProbe;
    const captureApi = options.captureApi || root.PageNestVideoFrameCapture;
    const clientApi = options.clientApi || root.PageNestNotebookClient;
    const feedbackApi = options.feedbackApi || root.PageNestVideoNotebookFeedback;
    let tab;

    try {
      const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
      tab = tabs?.[0];
      if (!tab?.id || !tab.url) {
        throw new RuntimeError("no-active-tab", "No active browser tab");
      }

      const feedbackHidden = await inject(
        chromeApi,
        tab.id,
        feedbackApi?.hideTransientUi
      );
      if (feedbackApi?.hideTransientUi && !feedbackHidden) {
        throw new RuntimeError(
          "video-frame-not-supported",
          "Unable to hide PageNest feedback before capture"
        );
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
        throw new RuntimeError(
          "video-frame-not-supported",
          "Unable to inspect video in the active tab"
        );
      }
      if (!probe?.ok) {
        throw new RuntimeError(
          probe?.error || "no-visible-video",
          "No suitable visible video was found"
        );
      }
      if (!sessionApi.sourcesMatch(tab.url, probe.page_url)) {
        throw new RuntimeError("video-page-changed", "Video page changed during capture");
      }

      let captured;
      try {
        const results = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: captureApi.captureVideoFrame,
          args: [{
            video_index: probe.video_index,
            expected_page_url: probe.page_url,
            max_dimension: captureApi.MAX_VIDEO_FRAME_DIMENSION,
            max_frame_bytes: captureApi.MAX_FRAME_BYTES,
            mime_type: captureApi.DEFAULT_FRAME_MIME_TYPE,
            quality: captureApi.DEFAULT_FRAME_QUALITY,
            timeout_ms: captureApi.FRAME_READY_TIMEOUT_MS,
          }],
        });
        captured = results?.[0]?.result;
      } catch {
        throw new RuntimeError(
          "video-frame-capture-unsupported",
          "Unable to capture a decoded video frame"
        );
      }
      if (!captured?.ok) {
        throw new RuntimeError(
          captured?.error || "video-frame-capture-unsupported",
          "Decoded video frame capture did not complete"
        );
      }
      if (!sessionApi.sourcesMatch(tab.url, captured.page_url)) {
        throw new RuntimeError("video-page-changed", "Video page changed during frame capture");
      }

      let connected;
      try {
        connected = await clientApi.connect(options.clientOptions);
      } catch (error) {
        throw controlled(error, "service-unavailable", "PageNest Service is unavailable");
      }

      const previousSession = await sessionApi.getSession(options.sessionOptions);
      const frame = {
        video_timestamp_seconds: captured.current_time,
        image_data_url: captured.image_data_url,
        request_analysis: true,
      };
      const sameNotebook = previousSession &&
        sessionApi.sourcesMatch(previousSession.source_url, probe.page_url);

      if (sameNotebook) {
        let result;
        try {
          result = await clientApi.appendEntry(connected, previousSession, frame);
        } catch (error) {
          throw controlled(error, "append-failed", "Unable to append the video frame");
        }
        await showFeedback(
          chromeApi,
          feedbackApi,
          tab.id,
          feedbackPayload("saved", { timestamp: timestampLabel(captured.current_time) })
        );
        const analysis = await analyzeSavedFrame(
          clientApi, connected, previousSession, result.entry_id
        );
        return {
          ok: true,
          created: false,
          result,
          analysis,
          probe,
          capture: {
            mime_type: captured.mime_type,
            size: captured.size,
            source_width: captured.source_width,
            source_height: captured.source_height,
            output_width: captured.output_width,
            output_height: captured.output_height,
            frame_sync: captured.frame_sync,
          },
        };
      }

      const title = String(probe.page_title || "视频笔记").trim().slice(0, 2000) || "视频笔记";
      let result;
      try {
        result = await clientApi.createNotebook(connected, {
          title,
          source_url: probe.page_url,
          source_title: title,
          initial_entry: frame,
        });
      } catch (error) {
        throw controlled(error, "create-failed", "Unable to create the Video Notebook");
      }

      const session = await sessionApi.setSession(
        {
          notebook_id: result.notebook_id,
          relative_path: result.relative_path,
          source_url: result.source_url || probe.page_url,
          source_title: result.source_title || title,
        },
        options.sessionOptions
      );
      await showFeedback(
        chromeApi,
        feedbackApi,
        tab.id,
        feedbackPayload("started", {
          title,
          notebook_id: session.notebook_id,
        })
      );
      const analysis = await analyzeSavedFrame(
        clientApi, connected, session, result.entry_id
      );
      return {
        ok: true,
        created: true,
        result,
        analysis,
        session,
        probe,
        capture: {
          mime_type: captured.mime_type,
          size: captured.size,
          source_width: captured.source_width,
          source_height: captured.source_height,
          output_width: captured.output_width,
          output_height: captured.output_height,
          frame_sync: captured.frame_sync,
        },
      };
    } catch (error) {
      const controlledError = controlled(
        error,
        "video-frame-capture-unsupported",
        "Video frame capture failed"
      );
      if (tab?.id) {
        await showFeedback(
          chromeApi,
          feedbackApi,
          tab.id,
          feedbackPayload("error", {
            message: ERROR_MESSAGES[controlledError.code] || "视频截图未完成，请稍后重试。",
          })
        );
      }
      throw controlledError;
    }
  }

  async function renameNotebook(notebookId, title, options = {}) {
    const sessionApi = options.sessionApi || root.PageNestVideoNotebookSession;
    const clientApi = options.clientApi || root.PageNestNotebookClient;
    const session = await sessionApi.getSession(options.sessionOptions);
    const normalizedId = String(notebookId || "").trim();
    const normalizedTitle = String(title || "").trim();
    if (!session || session.notebook_id !== normalizedId || !normalizedTitle) {
      throw new RuntimeError("rename-failed", "The active Video Notebook cannot be renamed");
    }
    try {
      const connected = await clientApi.connect(options.clientOptions);
      const result = await clientApi.renameNotebook(connected, session, normalizedTitle);
      return await sessionApi.setSession(
        {
          ...session,
          relative_path: result.relative_path,
        },
        options.sessionOptions
      );
    } catch (error) {
      throw controlled(error, "rename-failed", "Unable to rename the Video Notebook");
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
    timestampLabel,
    captureNotebookFrame,
    renameNotebook,
    handleCommand,
    registerCommandListener,
  });
});
